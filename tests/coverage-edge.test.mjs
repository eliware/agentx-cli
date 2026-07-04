import { afterEach, describe, expect, test } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { completePath } from '../src/completion.mjs';
import { formatPromptForCwd, formatSystemMessage, clearTerminal } from '../src/shell-display.mjs';
import { parseInternalCommand } from '../src/shell-commands.mjs';
import { buildWorkingDirectoryNote, resolveCdTarget } from '../src/shell-paths.mjs';
import { getTerminalWidth, wrapText } from '../src/text-wrap.mjs';
import { readFileTool, writeFileTool } from '../src/tool-files.mjs';
import { runToolCall, toolCallSummary } from '../src/tool-dispatch.mjs';
import { shellExec } from '../src/tool-shell.mjs';
import { readOptionalText, writeText, deleteOptional } from '../src/runtime.mjs';
import { persistResponseState, clearSession, readSessionState } from '../src/session-state.mjs';
import { extractTextFromResponse, extractUsage, isFunctionCall } from '../src/response-parts.mjs';
import { cleanupTempDir, makeDirectory, makeFile, makeTempDir } from './test-helpers.mjs';

describe('helper coverage', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length) cleanupTempDir(tempDirs.pop());
  });

  test('runtime file helpers read, write and delete optional files', async () => {
    const tmp = makeTempDir('agentx-runtime-');
    tempDirs.push(tmp);
    const filePath = path.join(tmp, 'value.txt');

    await expect(readOptionalText(filePath)).resolves.toBeNull();
    await writeText(filePath, 'hello');
    expect(readFileSync(filePath, 'utf8')).toBe('hello');
    await expect(readOptionalText(filePath)).resolves.toBe('hello');
    await deleteOptional(filePath);
    expect(existsSync(filePath)).toBe(false);
    await expect(deleteOptional(filePath)).resolves.toBeUndefined();
  });

  test('session state helpers persist, read and clear state files', async () => {
    const tmp = makeTempDir('agentx-state-');
    tempDirs.push(tmp);
    const filePath = path.join(tmp, '.agentx_responseid');

    await persistResponseState(filePath, { response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 } });
    expect(readFileSync(filePath, 'utf8')).toContain('"response_id": "resp-1"');
    await expect(readSessionState(filePath)).resolves.toEqual({ response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 } });

    await writeText(filePath, '42\n');
    await expect(readSessionState(filePath)).resolves.toEqual({ response_id: '42', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 } });

    await clearSession(filePath);
    expect(existsSync(filePath)).toBe(false);
  });

  test('shell display helpers format prompts, system messages and clear the terminal', () => {
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalUser = process.env.USER;

    try {
      process.stdout.write = (chunk) => {
        writes.push(String(chunk));
        return true;
      };
      delete process.env.USER;

      expect(formatPromptForCwd('/tmp/work')).toContain('root@dev:/tmp/work');
      expect(formatSystemMessage('hello')).toBe('\u001b[33mhello\u001b[0m');
      clearTerminal();
      expect(writes).toContain('\x1Bc');
    } finally {
      process.stdout.write = originalWrite;
      if (originalUser === undefined) delete process.env.USER;
      else process.env.USER = originalUser;
    }
  });

  test('shell command parsing and working-directory helpers cover all command forms', async () => {
    const tmp = makeTempDir('agentx-shell-');
    tempDirs.push(tmp);
    expect(parseInternalCommand('cd')).toEqual({ type: 'cd', target: '' });
    expect(parseInternalCommand('cd subdir')).toEqual({ type: 'cd', target: 'subdir' });
    expect(parseInternalCommand('unknown')).toBeNull();
    expect(buildWorkingDirectoryNote('/tmp/work')).toBe('User changed working directory to /tmp/work');

    makeDirectory(tmp, 'sub');
    const home = process.env.HOME;
    process.env.HOME = `${tmp}/sub`;
    try {
      await expect(resolveCdTarget('', tmp)).resolves.toBe(`${tmp}/sub`);
      await expect(resolveCdTarget('~', tmp)).resolves.toBe(`${tmp}/sub`);
      makeFile(tmp, 'file.txt');
      await expect(resolveCdTarget('file.txt', tmp)).rejects.toThrow(/not a directory/);
    } finally {
      if (home === undefined) delete process.env.HOME;
      else process.env.HOME = home;
    }
  });

  test('text wrapping handles defaults, blank lines, ansi text and invalid widths', () => {
    expect(getTerminalWidth(72)).toBeGreaterThan(0);
    expect(wrapText('', 10)).toBe('');
    expect(wrapText('one\ntwo', 10)).toBe('one\ntwo');
    expect(wrapText('  spaced words', 7)).toBe('spaced\nwords');
    const ansiWrapped = wrapText('\u001b[31mred text\u001b[0m more', 8);
    expect(ansiWrapped).toContain('\u001b[31mred text\u001b[0m');
    expect(ansiWrapped).toContain('\nmore');
    expect(wrapText('keep me', 0)).toBe('keep me');
    expect(wrapText('short')).toBe('short');
  });

  test('response parsing helpers handle empty and non-message items', () => {
    expect(extractTextFromResponse({ output: [{ type: 'reasoning', summary: [{ type: 'output_text', text: 'skip' }] }] })).toBe('');
    expect(extractTextFromResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'one' }] }, { type: 'message', content: [{ type: 'output_text', text: 'two' }] }] })).toBe('one\ntwo');
    expect(isFunctionCall({ type: 'message' })).toBe(false);
    expect(extractUsage({})).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
  });

  test('tool helpers cover supported, unsupported and error cases', async () => {
    const tmp = makeTempDir('agentx-tools-');
    tempDirs.push(tmp);
    const filePath = path.join(tmp, 'note.txt');
    await writeFileTool(filePath, 'hello');
    expect(readFileSync(filePath, 'utf8')).toBe('hello');
    expect(await readFileTool(filePath)).toBe('hello');
    expect(await readFileTool(path.join(tmp, 'missing.txt'))).toMatch(/^ERROR:/);
    expect(await writeFileTool(tmp, 'bad')).toMatch(/^ERROR:/);
    expect(await runToolCall({ name: 'read_file', arguments: JSON.stringify({ file_path: filePath }) }, tmp)).toBe('hello');
    expect(await runToolCall({ name: 'write_file', arguments: JSON.stringify({ file_path: path.join(tmp, 'nested', 'other.txt'), content: 'x' }) }, tmp)).toBe(`WROTE: ${path.join(tmp, 'nested', 'other.txt')}`);
    expect(await runToolCall({ name: 'shell_exec', arguments: JSON.stringify({ command: 'printf ok' }) }, tmp)).toBe('ok');
    expect(await runToolCall({ name: 'unknown', arguments: '{}' }, tmp)).toBe('ERROR: unsupported tool unknown');
    expect(toolCallSummary({ name: 'shell_exec', arguments: JSON.stringify({ command: 'ls' }) }, 'ok')).toBe('shell_exec ls... OK!');
    expect(toolCallSummary({ name: 'read_file', arguments: JSON.stringify({ file_path: 'a.txt' }) }, 'ok')).toBe('read_file a.txt... OK!');
    expect(toolCallSummary({ name: 'write_file', arguments: JSON.stringify({ file_path: 'b.txt' }) }, 'ok')).toBe('write_file b.txt... OK!');
    expect(toolCallSummary({ name: 'other' }, 'ok')).toBe('other... OK!');
  });

  test('shell execution returns command output and error output', async () => {
    const tmp = makeTempDir('agentx-shell-exec-');
    tempDirs.push(tmp);
    expect(await shellExec('printf "hello"', tmp)).toBe('hello');
    const failure = await shellExec('printf "boom" >&2; exit 1', tmp);
    expect(failure).toContain('boom');
  });

  test('path completion handles missing directories and token filtering', async () => {
    const tmp = makeTempDir('agentx-complete-');
    tempDirs.push(tmp);
    makeDirectory(tmp, 'folder');
    makeFile(tmp, '.hidden');
    makeFile(tmp, 'file.txt');

    const [missing] = await completePath('cd missing', tmp);
    expect(missing).toEqual([]);

    const [matches, token] = await completePath('cd f', tmp);
    expect(token).toBe('f');
    expect(matches).toContain('file.txt');
    expect(matches).toContain('folder/');
    expect(matches).not.toContain('.hidden');
  });
});
