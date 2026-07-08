import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { StringDecoder } from 'node:string_decoder';
import { MAX_TOOL_OUTPUT, truncateToolOutput } from './tool-output.mjs';
import { getShellLaunchers, isMissingLauncherError } from './platform.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 30_000;
const OUTPUT_TRUNCATION_NOTE = '\n[output truncated]';

function normalizeLimit(value, fallback = MAX_TOOL_OUTPUT) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function truncateText(text, limit) {
  const string = String(text ?? '');
  const max = normalizeLimit(limit);
  if (string.length <= max) return string;
  if (max <= OUTPUT_TRUNCATION_NOTE.length) return string.slice(0, max);
  return `${string.slice(0, max - OUTPUT_TRUNCATION_NOTE.length)}${OUTPUT_TRUNCATION_NOTE}`;
}

function makeShellCommandOutput({ stdout = '', stderr = '', outcome, maxOutputLength }) {
  return {
    stdout: truncateText(stdout, maxOutputLength),
    stderr: truncateText(stderr, maxOutputLength),
    outcome,
  };
}

function isTimeoutError(error) {
  return Boolean(error?.killed && error?.signal === 'SIGTERM');
}

function getLaunchPlan(command, platform = process.platform) {
  return getShellLaunchers(platform).map((launcher) => ({
    file: launcher.file,
    args: [...launcher.args, command],
  }));
}

async function executeWithLaunchers(command, cwd, { timeoutMs, maxOutputLength, platform = process.platform } = {}) {
  const maxBuffer = normalizeLimit(maxOutputLength);
  const options = {
    cwd,
    maxBuffer,
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };

  let lastError = null;
  for (const plan of getLaunchPlan(command, platform)) {
    try {
      const { stdout = '', stderr = '' } = await execFileAsync(plan.file, plan.args, options);
      return makeShellCommandOutput({ stdout, stderr, outcome: { type: 'exit', exit_code: 0 }, maxOutputLength });
    } catch (error) {
      lastError = error;
      if (isMissingLauncherError(error)) continue;
      const stdout = error?.stdout ?? '';
      let stderr = error?.stderr ?? '';
      if (!stdout && !stderr && error?.message) stderr = error.message;
      const outcome = isTimeoutError(error)
        ? { type: 'timeout' }
        : { type: 'exit', exit_code: Number.isFinite(error?.code) ? Number(error.code) : 1 };
      return makeShellCommandOutput({ stdout, stderr, outcome, maxOutputLength });
    }
  }

  const stderr = lastError?.message || 'Unable to locate a supported shell launcher';
  return makeShellCommandOutput({ stdout: '', stderr, outcome: { type: 'exit', exit_code: 1 }, maxOutputLength });
}

function normalizeCommands(commands) {
  if (Array.isArray(commands)) return commands.map((command) => String(command ?? ''));
  if (typeof commands === 'string') return [commands];
  return [];
}

function createStreamingCollector(maxOutputLength) {
  const max = normalizeLimit(maxOutputLength);
  const textParts = [];
  let totalLength = 0;
  let truncated = false;
  const stdoutDecoder = new StringDecoder('utf8');
  const stderrDecoder = new StringDecoder('utf8');

  function appendText(text) {
    if (!text || truncated) return;
    if (totalLength >= max) {
      truncated = true;
      return;
    }
    const remaining = max - totalLength;
    const part = text.length <= remaining ? text : text.slice(0, remaining);
    if (!part) {
      truncated = true;
      return;
    }
    textParts.push(part);
    totalLength += part.length;
    if (part.length < text.length) truncated = true;
  }

  function handleChunk(chunk, writer, decoder) {
    if (!chunk || !chunk.length) return;
    writer?.(chunk);
    appendText(decoder.write(chunk));
  }

  function finalize() {
    appendText(stdoutDecoder.end());
    appendText(stderrDecoder.end());
    return truncateText(textParts.join(''), maxOutputLength);
  }

  return {
    handleStdout(chunk, writer) {
      handleChunk(chunk, writer, stdoutDecoder);
    },
    handleStderr(chunk, writer) {
      handleChunk(chunk, writer, stderrDecoder);
    },
    finalize,
  };
}

async function executeShellCommandStream(command, cwd, { timeoutMs, maxOutputLength, writeStdout, writeStderr, platform = process.platform } = {}) {
  const collector = createStreamingCollector(maxOutputLength);
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;

  return await new Promise((resolve) => {
    const launchers = getLaunchPlan(command, platform);
    let current = 0;
    let completed = false;
    let timer = null;
    let child = null;
    let stderrFallback = '';

    const finish = (outcome) => {
      if (completed) return;
      completed = true;
      if (timer) clearTimeout(timer);
      resolve(makeShellCommandOutput({
        stdout: collector.finalize(),
        stderr: stderrFallback,
        outcome,
        maxOutputLength,
      }));
    };

    const startNext = () => {
      if (current >= launchers.length) {
        finish({ type: 'exit', exit_code: 1 });
        return;
      }

      const plan = launchers[current++];
      child = spawn(plan.file, plan.args, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      timer = setTimeout(() => {
        child?.kill('SIGTERM');
      }, timeout);

      child.stdout?.on('data', (chunk) => collector.handleStdout(chunk, writeStdout));
      child.stderr?.on('data', (chunk) => collector.handleStderr(chunk, writeStderr));
      child.on('error', (error) => {
        if (completed) return;
        if (isMissingLauncherError(error)) {
          if (timer) clearTimeout(timer);
          startNext();
          return;
        }
        stderrFallback = error?.message || String(error);
        finish({ type: 'exit', exit_code: 1 });
      });
      child.on('close', (code) => {
        if (completed) return;
        if (timer) clearTimeout(timer);
        finish({ type: 'exit', exit_code: Number.isFinite(code) ? Number(code) : 1 });
      });
    };

    startNext();
  });
}

export async function runShellCommands(commands, cwd, { timeoutMs, maxOutputLength, callId } = {}) {
  const output = [];
  const commandList = normalizeCommands(commands);
  let status = 'completed';

  for (const command of commandList) {
    const chunk = await executeWithLaunchers(command, cwd, { timeoutMs, maxOutputLength });
    output.push(chunk);
    if (chunk.outcome?.type === 'timeout') {
      status = 'incomplete';
      break;
    }
  }

  return {
    type: 'shell_call_output',
    call_id: callId || '',
    output,
    max_output_length: Number.isFinite(Number(maxOutputLength)) ? Number(maxOutputLength) : null,
    status,
  };
}

function normalizeGroup(group, defaultCwd) {
  return {
    cwd: String(group?.c ?? defaultCwd ?? ''),
    commands: normalizeCommands(group?.s),
    timeoutMs: group?.t,
    maxOutputLength: group?.l,
  };
}

function normalizeGroups(groups, defaultCwd) {
  return Array.isArray(groups) ? groups.map((group) => normalizeGroup(group, defaultCwd)) : [];
}

export async function runShellCommandGroups(groups, cwd, { callId, defaultCwd } = {}) {
  const resolvedDefaultCwd = String(defaultCwd ?? cwd ?? '');
  const normalizedGroups = normalizeGroups(groups, resolvedDefaultCwd);
  const results = await Promise.all(
    normalizedGroups.map(async (group) => runShellCommands(group.commands, group.cwd || resolvedDefaultCwd, { timeoutMs: group.timeoutMs, maxOutputLength: group.maxOutputLength })),
  );
  const output = results.flatMap((result) => Array.isArray(result?.output) ? result.output : []);
  const maxOutputLength = normalizedGroups.length > 0
    ? Math.max(...normalizedGroups.map((group) => Number(group.maxOutputLength)).filter((value) => Number.isFinite(value) && value > 0))
    : null;

  return {
    type: 'shell_call_output',
    call_id: callId || '',
    cwd: resolvedDefaultCwd,
    status: results.some((group) => group.status === 'incomplete') ? 'incomplete' : 'completed',
    output,
    max_output_length: Number.isFinite(maxOutputLength) ? maxOutputLength : null,
  };
}

export async function shellExec(command, cwd) {
  const result = await executeShellCommandStream(command, cwd, {
    maxOutputLength: MAX_TOOL_OUTPUT,
    writeStdout: (chunk) => process.stdout.write(chunk),
    writeStderr: (chunk) => process.stderr.write(chunk),
  });
  return truncateToolOutput(result.stdout);
}

export { getShellLaunchers };
