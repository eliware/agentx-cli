import { runShellCommandGroups, runShellCommands } from './tool-shell.mjs';

function isShellFunctionCall(call) {
  return call?.type === 'function_call' && call?.name === 'shell_call';
}

function getShellCommands(call) {
  const commands = call?.action?.commands;
  if (!Array.isArray(commands)) return [];
  return commands.map((command) => String(command ?? ''));
}

function getShellLimits(call) {
  return {
    timeoutMs: call?.action?.timeout_ms,
    maxOutputLength: call?.action?.max_output_length,
  };
}

function formatShellCommandSummary(call) {
  const commands = getShellCommands(call);
  return commands.length > 0 ? commands.join(' && ') : '';
}

function summarizeGroup(group, defaultCwd) {
  const cwd = group?.c == null ? defaultCwd : String(group.c);
  const commands = [];
  if (Array.isArray(group?.s)) {
    for (const command of group.s) commands.push(String(command ?? ''));
  }
  const prefix = cwd ? `cd ${cwd}: ` : '';
  return `${prefix}${commands.join(' && ')}`.trim();
}

function summarizeShellFunctionCall(call) {
  let raw = call?.input;
  if (raw == null) raw = call?.arguments;
  if (raw == null) return '';

  let input = {};
  try {
    input = JSON.parse(String(raw));
  } catch {
    return String(raw).trim();
  }

  const defaultCwd = String(input?.c ?? '');
  const groups = Array.isArray(input?.p) ? input.p : [];
  const parts = groups.map((group) => summarizeGroup(group, defaultCwd)).filter(Boolean);
  return parts.length > 0 ? parts.join(' || ') : '';
}

function normalizeShellOutput(call, output) {
  if (output && typeof output === 'object' && output.type === 'shell_call_output') {
    return { ...output, call_id: output.call_id || call?.call_id || call?.id || '' };
  }
  throw new TypeError('shell_call must return shell_call_output');
}

function normalizeFunctionOutput(call, output) {
  const callId = call?.call_id || call?.id || '';
  const text = typeof output === 'string' ? output : (output == null ? '' : JSON.stringify(output));
  return {
    type: 'function_call_output',
    call_id: callId,
    output: text,
  };
}

function parseShellFunctionInput(call) {
  let raw = call?.input;
  if (raw == null) raw = call?.arguments;
  if (raw == null) return {};

  try {
    return JSON.parse(String(raw));
  } catch (error) {
    return { __parseError: String(error?.message ?? error) };
  }
}

export async function runToolCall(call, cwd) {
  if (isShellFunctionCall(call)) {
    const input = parseShellFunctionInput(call);
    if (input?.__parseError) {
      return JSON.stringify({ error: 'invalid shell_call input', details: input.__parseError });
    }

    const defaultCwd = String(input?.c ?? cwd ?? '');
    const groups = Array.isArray(input?.p) ? input.p : [];
    const limits = {
      timeoutMs: input?.t,
      maxOutputLength: input?.l,
    };
    const result = await runShellCommandGroups(groups, cwd, { ...limits, callId: call?.call_id || call?.id || '', defaultCwd });
    return JSON.stringify(result);
  }

  if (call?.type === 'shell_call') {
    const commands = getShellCommands(call);
    const limits = getShellLimits(call);
    return await runShellCommands(commands, cwd, { ...limits, callId: call?.call_id || call?.id || '' });
  }

  return `ERROR: unsupported tool ${call?.name || call?.type}`;
}

export function toolCallSummary(call, output) {
  if (isShellFunctionCall(call)) {
    return summarizeShellFunctionCall(call);
  }
  if (call?.type === 'shell_call') {
    return formatShellCommandSummary(call);
  }
  return `${call?.name || call?.type || 'tool'}... OK!`;
}

export function toolOutputForCall(call, output) {
  if (isShellFunctionCall(call) || call?.type === 'function_call') return normalizeFunctionOutput(call, output);
  if (call?.type === 'shell_call') return normalizeShellOutput(call, output);
  return {
    type: 'function_call_output',
    call_id: call?.call_id || '',
    output: String(output ?? ''),
  };
}
