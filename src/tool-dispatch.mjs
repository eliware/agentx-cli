import { readFileTool, writeFileTool } from './tool-files.mjs';
import { shellExec } from './tool-shell.mjs';

export async function runToolCall(call, cwd) {
  const args = JSON.parse(call.arguments || '{}');
  switch (call.name) {
    case 'read_file':
      return await readFileTool(args.file_path);
    case 'write_file':
      return await writeFileTool(args.file_path, args.content ?? '');
    case 'shell_call':
      return await shellExec(args.command ?? '', cwd);
    default:
      return `ERROR: unsupported tool ${call.name}`;
  }
}

export function toolCallSummary(call, output) {
  const args = call.arguments ? JSON.parse(call.arguments) : {};
  if (call.name === 'shell_call') return `shell_call ${args.command || ''}... OK!`;
  if (call.name === 'read_file') return `read_file ${args.file_path || ''}... OK!`;
  if (call.name === 'write_file') return `write_file ${args.file_path || ''}... OK!`;
  return `${call.name}... OK!`;
}
