import { runShellCommands } from './tool-shell.mjs';

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
