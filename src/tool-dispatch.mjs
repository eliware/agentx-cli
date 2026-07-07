import { runShellCommands } from './tool-shell.mjs';

function getShellCommands(call) {
  return Array.isArray(call?.action?.commands) ? call.action.commands.map((command) => String(command ?? '')) : [];
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

function normalizeShellOutput(call, output) {
  if (output && typeof output === 'object' && output.type === 'shell_call_output') {
    return { ...output, call_id: output.call_id || call?.call_id || call?.id || '' };
  }
  throw new TypeError('shell_call must return shell_call_output');
}

export async function runToolCall(call, cwd) {
  if (call?.type !== 'shell_call') {
    return `ERROR: unsupported tool ${call?.name || call?.type}`;
  }

  const commands = getShellCommands(call);
  const limits = getShellLimits(call);
  return await runShellCommands(commands, cwd, { ...limits, callId: call?.call_id || call?.id || '' });
}

export function toolCallSummary(call, output) {
  if (call?.type === 'shell_call') {
    return formatShellCommandSummary(call);
  }
  return `${call?.name || call?.type || 'tool'}... OK!`;
}

export function toolOutputForCall(call, output) {
  if (call?.type === 'shell_call') return normalizeShellOutput(call, output);
  return {
    type: 'function_call_output',
    call_id: call?.call_id || '',
    output: String(output ?? ''),
  };
}
