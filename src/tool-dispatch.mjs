import { runShellCommands } from './tool-shell.mjs';


function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function requiresToolConfirmation(call) {
  if (call?.type !== 'shell_call') return false;
  const commands = normalizeCommandList(call?.action?.commands).join(' && ').toLowerCase();
  return /(^|[;&|\s])(rm|mv|cp|mkdir|rmdir|shutdown|reboot|poweroff|systemctl|apt|dnf|yum|npm\s+(install|uninstall|update| ci)|git\s+(commit|push|reset)|terraform|kubectl|xe\s+vm-(create|destroy|shutdown)|snapshot|ssh)(\s|$)/.test(commands);
}

export function toolCallIdentity(call, cwd = '') {
  const callId = call?.call_id || call?.id;
  if (callId) return `id:${callId}`;
  return `hash:${JSON.stringify(stableValue({
    type: call?.type || '',
    name: call?.name || '',
    cwd: cwd || '',
    action: call?.action || {},
    arguments: call?.arguments ?? call?.input ?? '',
  }))}`;
}

export function dedupeToolCalls(calls, cwd = '') {
  const seen = new Set();
  return calls.filter((call) => {
    const identity = toolCallIdentity(call, cwd);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function dedupeToolOutputs(outputs) {
  const seen = new Set();
  return outputs.filter((output) => {
    const callId = String(output?.call_id ?? '').trim();
    const identity = callId || JSON.stringify(stableValue(output));
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function normalizeCommandList(commands) {
  if (Array.isArray(commands)) return commands.map((command) => String(command ?? ''));
  if (typeof commands === 'string') return [commands];
  return [];
}

function summarizeShellCommands(commands) {
  return normalizeCommandList(commands).filter((command) => command !== '').join(' && ');
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

function parseShellActionCommands(call) {
  const commands = call?.action?.commands;
  return Array.isArray(commands) || typeof commands === 'string' ? commands : [];
}

export async function runToolCall(call, cwd) {
  if (call?.type === 'shell_call') {
    return await runShellCommands(parseShellActionCommands(call), cwd, {
      timeoutMs: call?.action?.timeout_ms,
      maxOutputLength: call?.action?.max_output_length,
      callId: call?.call_id || call?.id || '',
    });
  }

  return `ERROR: unsupported tool ${call?.name || call?.type}`;
}

export function toolCallSummary(call, _output) {
  if (call?.type === 'shell_call') {
    return summarizeShellCommands(call?.action?.commands);
  }
  return `${call?.name || call?.type || 'tool'}... OK!`;
}

export function toolOutputForCall(call, output) {
  if (call?.type === 'shell_call') return normalizeShellOutput(call, output);
  if (call?.type === 'function_call') return normalizeFunctionOutput(call, output);
  return {
    type: 'function_call_output',
    call_id: call?.call_id || '',
    output: String(output ?? ''),
  };
}
