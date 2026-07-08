import { afterEach, describe, expect, test } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { completePath } from '../src/completion.mjs';
import { formatPromptForCwd, formatSystemMessage, formatCommandMessage, clearTerminal } from '../src/shell-display.mjs';
import { parseInternalCommand } from '../src/shell-commands.mjs';
import { buildWorkingDirectoryNote, resolveCdTarget } from '../src/shell-paths.mjs';
import { getTerminalWidth, wrapText } from '../src/text-wrap.mjs';
import { runToolCall, toolCallSummary, toolOutputForCall } from '../src/tool-dispatch.mjs';
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

    await persistResponseState(filePath, { response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 }, last_user_message: 'hello', last_assistant_message: 'hi', pending_cli_transcript: '' });
    expect(readFileSync(filePath, 'utf8')).toContain('"response_id": "resp-1"');
    expect(readFileSync(filePath, 'utf8')).toContain('"last_user_message": "hello"');
    await expect(readSessionState(filePath)).resolves.toEqual({ response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 }, last_user_message: 'hello', last_assistant_message: 'hi', pending_cli_transcript: '' });

    await writeText(filePath, '42\n');
    await expect(readSessionState(filePath)).resolves.toEqual({ response_id: '42', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '' });

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
    expect(formatCommandMessage('hello')).toBe('\u001b[32mhello\u001b[0m');
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
    const originalStdoutWrite = process.stdout.write;
    process.stdout.write = () => true;
    let structured;
    try {
      expect(await runToolCall({ type: 'shell_call', call_id: 'call-0', action: { commands: ['printf ok'] } }, tmp)).toMatchObject({
        type: 'shell_call_output',
        call_id: 'call-0',
        status: 'completed',
        output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }],
      });
      structured = await runToolCall({ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'], timeout_ms: 30000, max_output_length: 12000 } }, tmp);
    } finally {
      process.stdout.write = originalStdoutWrite;
    }
    expect(structured).toMatchObject({
      type: 'shell_call_output',
      call_id: 'call-1',
      status: 'completed',
      output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }],
    });
    expect(await runToolCall({ type: 'shell_call', call_id: 'call-empty', action: {} }, tmp)).toMatchObject({
      type: 'shell_call_output',
      call_id: 'call-empty',
      status: 'completed',
      output: [],
    });
    expect(await runToolCall({ type: 'shell_call', action: { commands: [null] } }, tmp)).toMatchObject({
      type: 'shell_call_output',
      call_id: '',
      status: 'completed',
    });
    expect(await runToolCall({ name: 'unknown', arguments: '{}' }, tmp)).toBe('ERROR: unsupported tool unknown');
    expect(toolCallSummary({ type: 'shell_call', call_id: 'call-1', action: { commands: ['ls'] } }, structured)).toBe('ls');
    expect(toolCallSummary({ type: 'shell_call', call_id: 'call-empty', action: {} }, { type: 'shell_call_output', call_id: 'call-empty', output: [] })).toBe('');
    expect(toolCallSummary({ type: 'shell_call', action: null }, null)).toBe('');
    expect(await runToolCall({ type: 'shell_call', action: { commands: ['printf ok'] } }, tmp)).toMatchObject({ type: 'shell_call_output', call_id: '', status: 'completed' });
    expect(toolCallSummary({ type: 'shell_call', call_id: 'call-timeout', action: { commands: ['ls'] } }, { type: 'shell_call_output', output: [{ stdout: '', stderr: '', outcome: { type: 'timeout' } }] })).toBe('ls');
    expect(toolCallSummary({ type: 'shell_call', call_id: 'call-exit', action: { commands: ['ls'] } }, { type: 'shell_call_output', output: [{ stdout: '', stderr: '', outcome: { type: 'exit', exit_code: 2 } }] })).toBe('ls');
    expect(toolCallSummary({ type: 'shell_call', action: { commands: ['ls'] } }, null)).toBe('ls');
    expect(toolOutputForCall({ type: 'function_call', call_id: 'call-fn' }, 'done')).toEqual({ type: 'function_call_output', call_id: 'call-fn', output: 'done' });
    expect(() => toolOutputForCall({ type: 'shell_call', call_id: 'call-bad', action: { commands: ['ls'] } }, 'done')).toThrow('shell_call must return shell_call_output');
    expect(toolCallSummary({ type: 'other' }, 'ok')).toBe('other... OK!');
    expect(toolCallSummary({}, 'ok')).toBe('tool... OK!');
    expect(await runToolCall({ type: 'bogus' }, tmp)).toBe('ERROR: unsupported tool bogus');
    expect(await runToolCall({ type: 'shell_call', id: 'call-shell-id', action: { commands: ['printf ok'] } }, tmp)).toMatchObject({ type: 'shell_call_output', call_id: 'call-shell-id' });
    expect(toolOutputForCall({ type: 'function_call', id: 'call-fn-id' }, 'done')).toEqual({ type: 'function_call_output', call_id: 'call-fn-id', output: 'done' });
    expect(toolOutputForCall({ type: 'function_call' }, undefined)).toEqual({ type: 'function_call_output', call_id: '', output: '' });
    expect(toolOutputForCall({ type: 'shell_call', action: { commands: ['ls'] } }, { type: 'shell_call_output', output: [] })).toEqual({ type: 'shell_call_output', call_id: '', output: [] });
    const functionCall = JSON.parse(await runToolCall({ type: 'function_call', call_id: 'call-fn', name: 'shell_call', input: JSON.stringify({ c: tmp, p: [{ s: ['printf one'] }, { s: ['printf two'] }] }) }, tmp));
    expect(functionCall).toMatchObject({ type: 'shell_call_output', call_id: 'call-fn', cwd: tmp, status: 'completed' });
    expect(functionCall.output).toHaveLength(2);
    expect(functionCall.output[0].stdout).toBe('one');
    expect(functionCall.output[1].stdout).toBe('two');
    const started = Date.now();
    await runToolCall({ type: 'function_call', call_id: 'call-parallel', name: 'shell_call', input: JSON.stringify({ c: tmp, p: [{ s: ["node -e \"setTimeout(() => console.log('a'), 120)\""] }, { s: ["node -e \"setTimeout(() => console.log('b'), 120)\""] }] }) }, tmp);
    expect(Date.now() - started).toBeLessThan(350);
    expect(toolCallSummary({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ c: tmp, p: [{ s: ['printf one'] }, { s: ['printf two'] }] }) }, functionCall)).toContain('printf one');
    expect(toolCallSummary({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ c: tmp, p: [{ s: ['printf one'] }, { s: ['printf two'] }] }) }, functionCall)).toContain('printf two');
  });

  test('shell execution returns command output and error output', async () => {
    const tmp = makeTempDir('agentx-shell-exec-');
    tempDirs.push(tmp);
    expect(await shellExec('printf "hello"', tmp)).toBe('hello');
    const failure = await shellExec('printf "boom" >&2; exit 1', tmp);
    expect(failure).toContain('boom');
  });

  test('shell execution streams output to the terminal while it runs', async () => {
    const tmp = makeTempDir('agentx-shell-stream-');
    tempDirs.push(tmp);
    const writes = [];
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;

    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.stderr.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };

    try {
      const promise = shellExec('node -e "console.log(\'one\'); setTimeout(() => console.log(\'two\'), 150)"', tmp);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(writes.join('')).toContain('one');
      const output = await promise;
      expect(output).toContain('one');
      expect(output).toContain('two');
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }
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
