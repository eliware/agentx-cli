import { shellExec } from './tool-shell.mjs';

export async function runToolCall(call, cwd) {
  const args = JSON.parse(call.arguments || '{}');
  switch (call.name) {
    case 'shell_call':
      return await shellExec(args.command ?? '', cwd);
    default:
      return `ERROR: unsupported tool ${call.name}`;
  }
}

export function toolCallSummary(call, output) {
  const args = call.arguments ? JSON.parse(call.arguments) : {};
  if (call.name === 'shell_call') return `shell_call ${args.command || ''}... OK!`;
  return `${call.name}... OK!`;
}
