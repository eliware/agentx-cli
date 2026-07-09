import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { MAX_TOOL_OUTPUT } from './tool-output.mjs';
import { getShellLaunchers, isMissingLauncherError } from './platform.mjs';

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


function getLaunchPlan(command, platform = process.platform) {
  return getShellLaunchers(platform).map((launcher) => ({
    file: launcher.file,
    args: [...launcher.args, command],
  }));
}

function runLauncherCommand(plan, command, cwd, { timeoutMs, maxOutputLength, writeStdout, writeStderr } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.file, plan.args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;
    let timer = null;

    const finalizeChunk = (chunk, channel) => {
      if (!chunk) return;
      if (channel === 'stdout') {
        stdout = truncateText(`${stdout}${chunk}`, maxOutputLength);
        writeStdout?.(chunk);
      } else {
        stderr = truncateText(`${stderr}${chunk}`, maxOutputLength);
        writeStderr?.(chunk);
      }
    };

    const flushStream = (channel) => {
      const decoder = channel === 'stdout' ? stdoutDecoder : stderrDecoder;
      const chunk = decoder.end();
      finalizeChunk(chunk, channel);
    };

    const done = (result) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    child.on('error', (error) => {
      if (finished) return;
      if (timer) clearTimeout(timer);
      if (isMissingLauncherError(error)) {
        reject(error);
        return;
      }
      const message = error?.message || 'Unable to execute shell command';
      done(makeShellCommandOutput({ stdout, stderr: stderr || message, outcome: { type: 'exit', exit_code: 1 }, maxOutputLength }));
    });

    child.stdout?.on('data', (chunk) => {
      finalizeChunk(stdoutDecoder.write(chunk), 'stdout');
    });

    child.stderr?.on('data', (chunk) => {
      finalizeChunk(stderrDecoder.write(chunk), 'stderr');
    });

    child.on('close', (code, signal) => {
      flushStream('stdout');
      flushStream('stderr');
      const outcome = timedOut
        ? { type: 'timeout' }
        : (signal
          ? { type: 'exit', exit_code: 1 }
          : { type: 'exit', exit_code: Number.isFinite(code) ? Number(code) : 1 });
      done(makeShellCommandOutput({ stdout, stderr, outcome, maxOutputLength }));
    });

    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    if (timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeout);
    }
  });
}

async function executeWithLaunchers(command, cwd, { timeoutMs, maxOutputLength, platform = process.platform, writeStdout, writeStderr } = {}) {
  let lastError = null;
  for (const plan of getLaunchPlan(command, platform)) {
    try {
      return await runLauncherCommand(plan, command, cwd, { timeoutMs, maxOutputLength, writeStdout, writeStderr });
    } catch (error) {
      lastError = error;
      if (isMissingLauncherError(error)) continue;
      const stderr = error?.message || 'Unable to execute shell command';
      return makeShellCommandOutput({ stdout: '', stderr, outcome: { type: 'exit', exit_code: 1 }, maxOutputLength });
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

function normalizeSteps(steps, defaultCwd = '', fallbackTimeoutMs = null, fallbackMaxOutputLength = null) {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => ({
    command: String(step?.command ?? ''),
    cwd: step?.cwd == null ? String(defaultCwd ?? '') : String(step.cwd),
    timeoutMs: step?.timeoutMs ?? fallbackTimeoutMs,
    maxOutputLength: step?.maxOutputLength ?? fallbackMaxOutputLength,
  }));
}

export async function runShellCommandSequence(steps, { callId, defaultCwd = '' } = {}) {
  const normalizedSteps = normalizeSteps(steps, defaultCwd);
  const output = [];
  let status = 'completed';
  let maxOutputLength = null;

  for (const step of normalizedSteps) {
    const chunk = await executeWithLaunchers(step.command, step.cwd, {
      timeoutMs: step.timeoutMs,
      maxOutputLength: step.maxOutputLength,
    });
    output.push(chunk);
    const stepLimit = Number(step.maxOutputLength);
    if (Number.isFinite(stepLimit) && stepLimit > 0) {
      maxOutputLength = maxOutputLength == null ? stepLimit : Math.max(maxOutputLength, stepLimit);
    }
    if (chunk.outcome?.type === 'timeout') {
      status = 'incomplete';
      break;
    }
  }

  return {
    type: 'shell_call_output',
    call_id: callId || '',
    status,
    output,
    max_output_length: maxOutputLength,
  };
}

export async function runShellCommands(commands, cwd, { timeoutMs, maxOutputLength, callId } = {}) {
  const steps = normalizeCommands(commands).map((command) => ({
    command,
    cwd,
    timeoutMs,
    maxOutputLength,
  }));
  return await runShellCommandSequence(steps, { callId, defaultCwd: cwd });
}

export async function shellExec(command, cwd) {
  const result = await executeWithLaunchers(command, cwd, {
    maxOutputLength: MAX_TOOL_OUTPUT,
    writeStdout: (chunk) => process.stdout.write(chunk),
    writeStderr: (chunk) => process.stderr.write(chunk),
  });
  return result;
}

export { getShellLaunchers };
