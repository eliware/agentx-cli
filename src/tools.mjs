import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fs } from '@eliware/common';
import { MAX_TOOL_OUTPUT, truncateToolOutput } from './tool-output.mjs';

const execFileAsync = promisify(execFile);

export async function readFileTool(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return truncateToolOutput(content);
  } catch (error) {
    return `ERROR: ${error?.message || String(error)}`;
  }
}

export async function writeFileTool(filePath, content) {
  try {
    await fs.promises.writeFile(filePath, content, 'utf8');
    return `WROTE: ${filePath}`;
  } catch (error) {
    return `ERROR: ${error?.message || String(error)}`;
  }
}

async function collectSpawnOutput(command, cwd) {
  const child = execFileAsync(
    process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    process.platform === 'win32' ? ['/c', command] : ['-lc', command],
    { cwd, maxBuffer: MAX_TOOL_OUTPUT },
  );

  const { stdout = '', stderr = '' } = await child;
  const combined = [stdout, stderr].filter(Boolean).join(stderr && stdout ? '\n' : '');
  return truncateToolOutput(combined);
}

export async function shellExec(command, cwd) {
  try {
    return await collectSpawnOutput(command, cwd);
  } catch (error) {
    const message = error?.stderr || error?.stdout || error?.message || String(error);
    return truncateToolOutput(message);
  }
}

export async function runToolCall(call, cwd) {
  const args = JSON.parse(call.arguments || '{}');
  switch (call.name) {
    case 'read_file':
      return await readFileTool(args.file_path);
    case 'write_file':
      return await writeFileTool(args.file_path, args.content ?? '');
    case 'shell_exec':
      return await shellExec(args.command ?? '', cwd);
    default:
      return `ERROR: unsupported tool ${call.name}`;
  }
}

export function toolCallSummary(call, output) {
  const args = call.arguments ? JSON.parse(call.arguments) : {};
  if (call.name === 'shell_exec') return `shell_exec ${args.command || ''}... OK!`;
  if (call.name === 'read_file') return `read_file ${args.file_path || ''}... OK!`;
  if (call.name === 'write_file') return `write_file ${args.file_path || ''}... OK!`;
  return `${call.name}... OK!`;
}
