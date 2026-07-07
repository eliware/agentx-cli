import { afterEach, describe, expect, test } from '@jest/globals';
import { fs } from '@eliware/common';
import path from 'node:path';
import { completePath as completePathFromWrapper } from '../src/completion.mjs';
import { applyFirstUserMessage, buildInputMessage } from '../src/prompt.mjs';
import { buildWorkingDirectoryNote, clearTerminal, formatPromptForCwd, formatSystemMessage, parseInternalCommand, readAgentsFromCwdAndParents, resolveCdTarget } from '../src/shell.mjs';
import { buildDeveloperText } from '../src/prompt-text.mjs';
import { runToolCall as runToolCallDirect, toolCallSummary as toolCallSummaryDirect } from '../src/tool-dispatch.mjs';
import { runToolCall as runToolCallFromWrapper, toolCallSummary as toolCallSummaryFromWrapper } from '../src/tool-runtime.mjs';
import { normalizeUsage, calculateUsageCost, formatUsageReport, formatTurnUsage, formatTurnUsageReport } from '../src/usage.mjs';
import { collectStoredResponseItems, extractTextFromResponse, extractUsage, handleToolCalls, responseItemToTranscript, sendMessage } from '../src/agent-session.mjs';
import { clearSession, persistResponseState, readSessionState } from '../src/session-state.mjs';
import { readJson, readOptionalText, writeText, deleteOptional } from '../src/runtime.mjs';
import { shellExec } from '../src/tool-shell.mjs';
import { addTurn, addUsageTotals, createUsageTotals, isFunctionCall } from '../src/response-parts.mjs';
import { cleanupTempDir, makeDirectory, makeFile, makeTempDir } from './test-helpers.mjs';

describe('coverage gaps', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length) cleanupTempDir(tempDirs.pop());
  });

  test('wrapper modules re-export their underlying implementations', async () => {
    const [completion, prompt, shell, toolRuntime] = await Promise.all([
      import('../src/completion.mjs'),
      import('../src/prompt.mjs'),
      import('../src/shell.mjs'),
      import('../src/tool-runtime.mjs'),
    ]);

    expect(completion.completePath).toBe(completePathFromWrapper);
    expect(prompt.applyFirstUserMessage).toBe(applyFirstUserMessage);
    expect(prompt.buildInputMessage).toBe(buildInputMessage);
    expect(shell.buildWorkingDirectoryNote).toBe(buildWorkingDirectoryNote);
    expect(shell.clearTerminal).toBe(clearTerminal);
    expect(shell.formatPromptForCwd).toBe(formatPromptForCwd);
    expect(shell.formatSystemMessage).toBe(formatSystemMessage);
    expect(shell.parseInternalCommand).toBe(parseInternalCommand);
    expect(shell.readAgentsFromCwdAndParents).toBe(readAgentsFromCwdAndParents);
    expect(shell.resolveCdTarget).toBe(resolveCdTarget);
    expect(toolRuntime.runToolCall).toBe(runToolCallFromWrapper);
    expect(toolRuntime.toolCallSummary).toBe(toolCallSummaryFromWrapper);
    expect(toolRuntime.runToolCall).toBe(runToolCallDirect);
    expect(toolRuntime.toolCallSummary).toBe(toolCallSummaryDirect);
  });

  test('usage helpers normalize and format token counts', () => {
    expect(normalizeUsage({ inputTokens: 12, cachedTokens: 5, outputTokens: 7 })).toEqual({ inputTokens: 7, cachedTokens: 5, outputTokens: 7 });
    expect(normalizeUsage({ inputTokens: 2, cachedTokens: 9, outputTokens: 1 })).toEqual({ inputTokens: 0, cachedTokens: 9, outputTokens: 1 });
    expect(calculateUsageCost({ inputTokens: 1_000_000, cachedTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(5.325);
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 })).toContain('msgs=4');
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 0 })).toContain('avg=$0.000');
    expect(formatTurnUsage({ inputTokens: 1, cachedTokens: 2, outputTokens: 3 })).toContain('msgs=1');
    expect(formatTurnUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3 })).toContain('sum=$');
  });

  test('prompt builder replaces the first user placeholder and preserves developer text', () => {
    const template = {
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
      ],
    };

    const updated = applyFirstUserMessage(template, 'hello there', 'AGENTS body', '/tmp/work');
    expect(updated.input[0].content[0].text).toContain('Identity guidance');
    expect(updated.input[1].content[0].text).toBe('hello there');
  });

  test('runtime helpers read json and propagate unexpected read errors', async () => {
    const tmp = makeTempDir('agentx-runtime-gaps-');
    tempDirs.push(tmp);
    const file = path.join(tmp, 'value.json');
    makeFile(tmp, 'value.json', '{"answer":42}');
    expect(await readJson(file)).toEqual({ answer: 42 });

    const originalReadFile = fs.promises.readFile;
    fs.promises.readFile = async () => { throw Object.assign(new Error('boom'), { code: 'EACCES' }); };
    try {
      await expect(readOptionalText(file)).rejects.toThrow('boom');
    } finally {
      fs.promises.readFile = originalReadFile;
    }
  });

  test('session helpers cover state persistence and fallback parsing', async () => {
    const tmp = makeTempDir('agentx-session-state-');
    tempDirs.push(tmp);
    const statePath = path.join(tmp, '.agentx_responseid');
    const missingStatePath = path.join(tmp, 'missing-state.txt');
    await persistResponseState(statePath, { response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 }, last_user_message: 'hello', last_assistant_message: 'hi', pending_cli_transcript: '' });
    expect(await readSessionState(statePath)).toEqual({ response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 }, last_user_message: 'hello', last_assistant_message: 'hi', pending_cli_transcript: '' });
    expect(await readSessionState(missingStatePath)).toBeNull();
    await writeText(statePath, 'resp-legacy\n');
    expect(await readSessionState(statePath)).toEqual({ response_id: 'resp-legacy', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '' });
    await writeText(statePath, '123');
    expect(await readSessionState(statePath)).toEqual({ response_id: '123', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '' });
    await writeText(statePath, 'not-json');
    expect(await readSessionState(statePath)).toEqual({ response_id: 'not-json', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '' });
    await writeText(statePath, '   ');
    expect(await readSessionState(statePath)).toEqual({ response_id: '', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '' });
    await writeText(statePath, '{}');
    expect(await readSessionState(statePath)).toEqual({ response_id: '', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '' });
    await clearSession(statePath);
    expect(await readOptionalText(statePath)).toBeNull();
    await deleteOptional(statePath);
  });

  test('agent-session helpers cover empty history, fallback text, and no-tool responses', async () => {
    expect(extractTextFromResponse()).toBe('');
    expect(extractTextFromResponse({ output: [{ type: 'message' }] })).toBe('');
    expect(extractTextFromResponse({ output: [{ type: 'message', content: [{ type: 'output_text' }, { type: 'output_text', text: 'a' }] }, { type: 'reasoning' }, { type: 'other' }] })).toBe('a');
    expect(isFunctionCall({ type: 'function_call' })).toBe(true);
    expect(isFunctionCall({ type: 'message' })).toBe(false);
    expect(extractUsage()).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(createUsageTotals()).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 });
    expect(addUsageTotals({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }, { inputTokens: 3, cachedTokens: 1, outputTokens: 2 })).toEqual({ inputTokens: 3, cachedTokens: 1, outputTokens: 2 });
    expect(addUsageTotals(createUsageTotals(), undefined)).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 });
    expect(addTurn({ turns: 0 })).toEqual({ turns: 1 });
    expect(responseItemToTranscript({ type: 'message' })).toBe('');
    expect(responseItemToTranscript({ type: 'message', content: [{ type: 'refusal' }] })).toBe('');
    expect(responseItemToTranscript({ type: 'message', content: [{ type: 'input_text', text: 'fallback' }] })).toBe('message: fallback');
    expect(responseItemToTranscript({ role: 'assistant', type: 'message', content: [{ type: 'input_text', text: 'x' }, { type: 'output_text', text: 'y' }, { type: 'refusal', refusal: 'nope' }] })).toBe('assistant: x\ny\n[refusal] nope');
    expect(responseItemToTranscript({ type: 'function_call' })).toBe('assistant tool call: function()');
    expect(responseItemToTranscript({ type: 'function_call_output' })).toBe('tool output: ');
    expect(responseItemToTranscript({ type: 'reasoning', summary: [] })).toBe('');
    expect(responseItemToTranscript({ type: 'file_call', result: 'ok' })).toContain('assistant file_call:');
    expect(responseItemToTranscript({ type: 'file_call_output', result: 'ok' })).toContain('tool output file_call_output:');
    expect(responseItemToTranscript({ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'] }, status: 'completed' })).toContain('assistant shell call:');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-1', status: 'completed' })).toContain('tool output shell_call_output:');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-1', status: 'completed', output: [{ outcome: { type: 'exit', exit_code: 0 } }] })).toContain('tool output shell_call_output:');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-1', status: 'completed', output: [{ stdout: 'ok', stderr: 'err' }] })).toContain('tool output shell_call_output:');
    expect(responseItemToTranscript({ type: 'file_call_output', output: [null] })).toContain('tool output file_call_output:');
    expect(responseItemToTranscript({ type: 'file_call_output', output: [{ outcome: { type: 'exit', exit_code: 0 } }] })).toContain('tool output file_call_output:');
    expect(extractTextFromResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: '' }, { type: 'other' }] }] })).toBe('');
    await expect(collectStoredResponseItems({ responses: { retrieve: async () => undefined } }, 'resp-1')).resolves.toEqual([]);
    await expect(handleToolCalls({}, { id: 'resp-no-output' }, {}, '/tmp/work')).resolves.toEqual({ id: 'resp-no-output' });

    const shellRequests = [];
    const shellOpenai = {
      responses: {
        create: async (request) => {
          shellRequests.push(request);
          return { id: 'resp-shell-next', output: [] };
        },
      },
    };
    await handleToolCalls(shellOpenai, { id: 'resp-shell', output: [{ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'] } }] }, { model: 'test-model', tools: [] }, '/tmp/work', null, async () => ({ type: 'shell_call_output', call_id: 'call-1', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }], status: 'completed', max_output_length: null }));
    expect(shellRequests[0].input).toEqual([{ type: 'shell_call_output', call_id: 'call-1', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }], status: 'completed', max_output_length: null }]);

    const requestCalls = [];
    const sendOpenai = {
      responses: {
        create: async (request) => {
          requestCalls.push(request);
          return { id: 'resp-2', output: [{ type: 'message', content: [{ type: 'output_text', text: 'done' }] }] };
        },
      },
    };
    await sendMessage(sendOpenai, { model: 'test-model', input: [{ role: 'developer', content: [{ type: 'input_text', text: 'base' }] }, { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] }], tools: [] }, '', 'hello', '', '/tmp/work');
    expect(requestCalls[0].input[0].content[0].text).toContain('base');

    const noOutputOpenai = {
      responses: {
        create: async () => ({ id: 'resp-no-output' }),
      },
    };
    await expect(sendMessage(noOutputOpenai, { model: 'test-model', input: [] }, 'previous', 'hello', '', '/tmp/work')).resolves.toEqual({ id: 'resp-no-output' });
  });

  test('shell path helpers handle home, tilde and invalid targets', async () => {
    const tmp = makeTempDir('agentx-shell-paths-');
    tempDirs.push(tmp);
    makeDirectory(tmp, 'home/child');
    makeFile(tmp, 'file.txt');
    const originalHome = process.env.HOME;
    process.env.HOME = path.join(tmp, 'home');

    try {
      expect(await resolveCdTarget('', tmp)).toBe(path.join(tmp, 'home'));
      expect(await resolveCdTarget('~/child', tmp)).toBe(path.join(tmp, 'home', 'child'));
      await expect(resolveCdTarget('file.txt', tmp)).rejects.toThrow(/not a directory/);
      process.env.HOME = path.join(tmp, 'file.txt');
      await expect(resolveCdTarget('', tmp)).rejects.toThrow(`not a directory: ${path.join(tmp, 'file.txt')}`);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  test('shell path helpers handle cwd fallback when HOME is unavailable', async () => {
    const tmp = makeTempDir('agentx-shell-paths-fallback-');
    tempDirs.push(tmp);
    const originalHome = process.env.HOME;
    delete process.env.HOME;

    try {
      expect(await resolveCdTarget('', tmp)).toBe(tmp);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  test('shell path helpers resolve tildes without HOME', async () => {
    const tmp = makeTempDir('agentx-shell-paths-tilde-');
    tempDirs.push(tmp);
    makeDirectory(tmp, 'child');
    const originalHome = process.env.HOME;
    delete process.env.HOME;

    try {
      expect(await resolveCdTarget('~/child', tmp)).toBe(path.join(tmp, 'child'));
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  test('shell agent file discovery rejects unexpected file errors', async () => {
    const tmp = makeTempDir('agentx-shell-agents-');
    tempDirs.push(tmp);
    makeDirectory(tmp, 'child');
    const originalReadFile = fs.promises.readFile;
    fs.promises.readFile = async () => { throw Object.assign(new Error('disk failure'), { code: 'EIO' }); };

    try {
      await expect(readAgentsFromCwdAndParents(path.join(tmp, 'child'))).rejects.toThrow('disk failure');
    } finally {
      fs.promises.readFile = originalReadFile;
    }
  });

  test('response transcripts cover function calls, outputs and reasoning variants', () => {
    expect(responseItemToTranscript(null)).toBe('');
    expect(responseItemToTranscript({ role: 'developer', type: 'message', content: [{ type: 'input_text', text: 'skip' }] })).toBe('');
    expect(responseItemToTranscript({ role: 'user', type: 'message', content: [{ type: 'input_text', text: 'hello' }] })).toBe('user: hello');
    expect(responseItemToTranscript({ role: 'user', type: 'message', content: [{ type: 'input_text' }] })).toBe('');
    expect(responseItemToTranscript({ role: 'assistant', type: 'message', content: [{ type: 'refusal', refusal: 'nope' }] })).toContain('[refusal] nope');
    expect(responseItemToTranscript({})).toBe('item: {}');
    expect(responseItemToTranscript({ type: 'function_call', name: 'search', arguments: '{"q":"hi"}' })).toBe('assistant tool call: search({"q":"hi"})');
    expect(responseItemToTranscript({ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'] }, status: 'completed' })).toContain('assistant shell call:');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-1', status: 'completed' })).toContain('tool output shell_call_output:');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-1', status: 'completed', output: [{ outcome: { type: 'exit', exit_code: 0 } }] })).toContain('tool output shell_call_output:');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-1', status: 'completed', output: [{ stdout: 'ok', stderr: 'err' }] })).toContain('tool output shell_call_output:');
    expect(responseItemToTranscript({ type: 'function_call_output', output: 'done' })).toBe('tool output: done');
    expect(responseItemToTranscript({ type: 'shell_call_output', call_id: 'call-1', status: 'completed', max_output_length: null, output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }] })).toContain('tool output shell_call_output:');
    expect(responseItemToTranscript({ type: 'file_call_output', output: [null] })).toContain('tool output file_call_output:');
    expect(responseItemToTranscript({ type: 'file_call_output', output: [{ outcome: { type: 'exit', exit_code: 0 } }] })).toContain('tool output file_call_output:');
    expect(responseItemToTranscript({ type: 'reasoning', summary: [{ type: 'output_text', text: 'plan' }] })).toBe('assistant reasoning summary: plan');
    expect(responseItemToTranscript({ role: 'assistant', type: 'file_call', encrypted_content: 'secret', result: 'x'.repeat(501) })).toContain('[encrypted reasoning omitted]');
    expect(responseItemToTranscript({ role: 'assistant', type: 'file_call', encrypted_content: 'secret', result: 'x'.repeat(501) })).toContain('[large result omitted: 501 chars]');
    expect(responseItemToTranscript({ role: 'assistant', type: 'file_call_output', result: 'y'.repeat(501) })).toContain('tool output file_call_output:');
  });

  test('text wrapping handles fallback widths, long words and // tokens', async () => {
    const textWrap = await import('../src/text-wrap.mjs');
    const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');

    try {
      Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 120 });
      expect(textWrap.getTerminalWidth(72)).toBe(120);
      Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 0 });
      expect(textWrap.getTerminalWidth(72)).toBe(72);
    } finally {
      if (originalColumns) Object.defineProperty(process.stdout, 'columns', originalColumns);
    }

    expect(textWrap.wrapText('supercalifragilisticexpialidocious', 5)).toContain('\n');
    expect(textWrap.wrapText('\nnext', 10)).toBe('\nnext');
    expect(textWrap.wrapText('abc    ', 3)).toBe('abc');
    const tmp = makeTempDir('agentx-complete-gaps-');
    tempDirs.push(tmp);
    makeDirectory(tmp, 'testdir');
    const [missingMatches] = await completePathFromWrapper('cd missing/file', tmp);
    expect(missingMatches).toEqual([]);
    makeDirectory(tmp, 'absdir');
    const [absoluteMatches, absoluteToken] = await completePathFromWrapper(`cd ${path.join(tmp, 'a')}`, tmp);
    expect(absoluteToken).toBe(path.join(tmp, 'a'));
    expect(absoluteMatches).toContain(`${path.join(tmp, 'absdir')}/`);
    const [rootMatches, rootToken] = await completePathFromWrapper('cd /', tmp);
    expect(rootToken).toBe('/');
    expect(Array.isArray(rootMatches)).toBe(true);
    const [dotSlashMatches, dotSlashToken] = await completePathFromWrapper('cd ./a', tmp);
    expect(dotSlashToken).toBe('./a');
    expect(dotSlashMatches).toContain('absdir/');
    const [matches, token] = await completePathFromWrapper('cd //te', tmp);
    expect(token).toBe('/te');
    expect(Array.isArray(matches)).toBe(true);
  });

  test('prompt builder and developer text handle fallback inputs', () => {
    const template = {
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'hello world' }] },
      ],
    };
    const updated = applyFirstUserMessage(template, 'hi there', '', '/tmp/work');
    expect(updated.input[1].content[0].text).toBe('hi there');
    const replaced = applyFirstUserMessage({
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text' }] },
      ],
    }, 'hi there', '', '/tmp/work');
    expect(replaced.input[1].content[0].text).toBe('hi there');
    const fallback = applyFirstUserMessage(null, 'ignored', '', '/tmp/work');
    expect(fallback).toBeNull();
    expect(buildDeveloperText({ instructions: 'instruction fallback' }, '', '/tmp/work')).toContain('instruction fallback');
    expect(buildDeveloperText({ input: [] }, 'AGENTS body', '/tmp/work')).toContain('AGENTS body');
  });

  test('usage helpers cover default arguments and turn formatting', () => {
    const defaultTmp = makeTempDir();
    tempDirs.push(defaultTmp);
    expect(path.basename(defaultTmp)).toMatch(/^agentx-/);
    expect(normalizeUsage()).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({ inputTokens: null, cachedTokens: null, outputTokens: null })).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(calculateUsageCost({ inputTokens: 1, cachedTokens: 2, outputTokens: 3 })).toBeGreaterThan(0);
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 0, outputTokens: 0, turns: 0 })).toContain('msgs=0');
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 0, outputTokens: 0, turns: 2 })).toContain('msgs=2');
    expect(formatTurnUsage({ inputTokens: 1, cachedTokens: 0, outputTokens: 0 })).toContain('msgs=1');
    expect(formatTurnUsageReport({ inputTokens: 1, cachedTokens: 0, outputTokens: 0 })).toContain('sum=$');
  });

  test('tool helpers cover structured shell calls and unsupported tools', async () => {
    const tmp = makeTempDir('agentx-tool-gaps-');
    tempDirs.push(tmp);
    expect(await runToolCallDirect({ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'] } }, tmp)).toMatchObject({
      type: 'shell_call_output',
      call_id: 'call-1',
      status: 'completed',
    });
    expect(await runToolCallDirect({ name: 'unknown', arguments: '' }, tmp)).toBe('ERROR: unsupported tool unknown');
    expect(toolCallSummaryDirect({ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'] } }, { type: 'shell_call_output', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }] })).toBe('shell_call printf ok... OK!');
  });

  test('parseInternalCommand and display helpers cover remaining branches', () => {
    expect(parseInternalCommand('cd')).toEqual({ type: 'cd', target: '' });
    expect(parseInternalCommand('cd nested')).toEqual({ type: 'cd', target: 'nested' });
    expect(parseInternalCommand('/exit')).toEqual({ type: 'exit' });
    expect(parseInternalCommand('/clear')).toEqual({ type: 'session_clear' });
    expect(parseInternalCommand('unknown')).toBeNull();
    expect(buildWorkingDirectoryNote('/tmp/work')).toBe('User changed working directory to /tmp/work');
  });
});
