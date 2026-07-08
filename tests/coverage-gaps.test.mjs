import { afterEach, describe, expect, test } from '@jest/globals';
import { fs } from '@eliware/common';
import path from 'node:path';
import { completePath as completePathFromWrapper } from '../src/completion.mjs';
import { applyFirstUserMessage } from '../src/prompt-builder.mjs';
import { buildWorkingDirectoryNote, clearTerminal, formatPromptForCwd, formatSystemMessage, parseInternalCommand, readAgentsFromCwdAndParents, resolveCdTarget } from '../src/shell.mjs';
import { formatCommandMessage } from '../src/shell-display.mjs';
import { buildDeveloperText } from '../src/prompt-text.mjs';
import { runToolCall as runToolCallDirect, toolCallSummary as toolCallSummaryDirect, toolOutputForCall as toolOutputForCallDirect } from '../src/tool-dispatch.mjs';
import { normalizeUsage, calculateUsageCost, formatUsageReport, formatTurnUsage, formatTurnUsageReport } from '../src/usage.mjs';
import { extractTextFromResponse, extractUsage, handleToolCalls, responseItemToTranscript, sendMessage } from '../src/agent-session.mjs';
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
    const [completion, shell] = await Promise.all([
      import('../src/completion.mjs'),
      import('../src/shell.mjs'),
    ]);

    expect(completion.completePath).toBe(completePathFromWrapper);
    expect(shell.buildWorkingDirectoryNote).toBe(buildWorkingDirectoryNote);
    expect(shell.clearTerminal).toBe(clearTerminal);
    expect(shell.formatPromptForCwd).toBe(formatPromptForCwd);
    expect(shell.formatSystemMessage).toBe(formatSystemMessage);
    expect(formatCommandMessage('x')).toBe('\u001b[32mx\u001b[0m');
    expect(shell.parseInternalCommand).toBe(parseInternalCommand);
    expect(shell.readAgentsFromCwdAndParents).toBe(readAgentsFromCwdAndParents);
    expect(shell.resolveCdTarget).toBe(resolveCdTarget);
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

    const originalStdoutWrite = process.stdout.write;
    process.stdout.write = () => true;
    try {
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
    } finally {
      process.stdout.write = originalStdoutWrite;
    }
  });

  test('tool dispatch covers shell-call parse errors, execution, and output normalization', async () => {
    expect(toolCallSummaryDirect({ type: 'function_call', name: 'shell_call', input: '{not valid json' })).toBe('{not valid json');
    expect(toolCallSummaryDirect({ type: 'function_call', name: 'search' })).toBe('search... OK!');
    expect(toolCallSummaryDirect({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ c: '/opt/agentx-cli', p: [{ s: ['printf ok'] }, { c: '/tmp', s: [] }] }) })).toBe('cd /opt/agentx-cli: printf ok || cd /tmp:');
    expect(toolCallSummaryDirect({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ c: '/tmp', p: [{ s: [null] }] }) })).toBe('cd /tmp:');
    expect(toolCallSummaryDirect({ type: 'function_call', name: 'shell_call', input: JSON.stringify({}) })).toBe('');
    expect(toolCallSummaryDirect({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ p: [{ s: ['echo hi'] }] }) })).toBe('echo hi');
    expect(toolCallSummaryDirect({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ p: [{ s: 'echo hi' }] }) })).toBe('echo hi');
    expect(toolCallSummaryDirect({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ c: '/tmp', p: [{ s: 123 }] }) })).toBe('cd /tmp:');
    expect(toolCallSummaryDirect({ type: 'shell_call' })).toBe('');
    expect(toolCallSummaryDirect({ type: 'shell_call', action: { commands: null } })).toBe('');
    expect(toolCallSummaryDirect({ type: 'shell_call', action: { commands: [null] } })).toBe('');
    expect(toolCallSummaryDirect({ type: 'function_call' })).toBe('function_call... OK!');
    expect(toolCallSummaryDirect({})).toBe('tool... OK!');

    expect(toolCallSummaryDirect({ type: 'function_call', name: 'shell_call' })).toBe('');
    expect(toolCallSummaryDirect({ type: 'function_call', name: 'shell_call', arguments: JSON.stringify({ p: [{ s: ['echo arg'] }] }) })).toBe('echo arg');
    expect(toolCallSummaryDirect({ type: 'function_call', name: 'shell_call', arguments: JSON.stringify({ p: [{ c: '/tmp', s: 'nope' }] }) })).toBe('cd /tmp: nope');

    const shellFunctionResult = JSON.parse(await runToolCallDirect({ type: 'function_call', name: 'shell_call', call_id: 'call-0', input: JSON.stringify({ c: '/opt/agentx-cli', p: [{ s: ['printf ok'] }], t: 1000, l: 123 }) }, '/opt/agentx-cli'));
    expect(shellFunctionResult).toMatchObject({ call_id: 'call-0', cwd: '/opt/agentx-cli', status: 'completed', type: 'shell_call_output' });
    expect(shellFunctionResult.output).toEqual([{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }]);
    const shellFunctionResultString = JSON.parse(await runToolCallDirect({ type: 'function_call', name: 'shell_call', call_id: 'call-0b', input: JSON.stringify({ c: '/opt/agentx-cli', p: [{ s: 'printf ok' }], t: 1000, l: 123 }) }, '/opt/agentx-cli'));
    expect(shellFunctionResultString.output).toEqual([{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }]);

    const shellFunctionResultNoCwd = JSON.parse(await runToolCallDirect({ type: 'function_call', name: 'shell_call', call_id: 'call-00', input: JSON.stringify({ p: [{ s: ['true'] }] }) }, '/opt/agentx-cli'));
    expect(shellFunctionResultNoCwd.cwd).toBe('/opt/agentx-cli');
    const shellFunctionResultEmpty = JSON.parse(await runToolCallDirect({ type: 'function_call', name: 'shell_call', call_id: 'call-01', input: JSON.stringify({}) }, ''));
    expect(shellFunctionResultEmpty.status).toBe('completed');

    const shellFunctionResultId = JSON.parse(await runToolCallDirect({ type: 'function_call', name: 'shell_call', id: 'call-id', input: JSON.stringify({ p: [{ s: ['true'] }] }) }, '/opt/agentx-cli'));
    expect(shellFunctionResultId.call_id).toBe('call-id');
    const shellFunctionResultDefault = JSON.parse(await runToolCallDirect({ type: 'function_call', name: 'shell_call', input: JSON.stringify({ p: [{ s: ['true'] }] }) }, undefined));
    expect(shellFunctionResultDefault.cwd).toBe('');
    const shellFunctionResultEmptyInput = JSON.parse(await runToolCallDirect({ type: 'function_call', name: 'shell_call' }, '/opt/agentx-cli'));
    expect(shellFunctionResultEmptyInput).toMatchObject({ call_id: '', cwd: '/opt/agentx-cli', status: 'completed' });

    const originalJsonParse = JSON.parse;
    try {
      JSON.parse = () => { throw 'bad parse'; };
      await expect(runToolCallDirect({ type: 'function_call', name: 'shell_call', input: '{not valid json' }, '/opt/agentx-cli')).resolves.toContain('invalid shell_call input');
      await expect(runToolCallDirect({ type: 'function_call', name: 'shell_call', arguments: '{not valid json' }, '/opt/agentx-cli')).resolves.toContain('invalid shell_call input');
    } finally {
      JSON.parse = originalJsonParse;
    }

    const shellResult = await runToolCallDirect({ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'] } }, '/opt/agentx-cli');
    expect(shellResult).toMatchObject({ type: 'shell_call_output', call_id: 'call-1', status: 'completed' });
    expect(shellResult.output[0].stdout).toContain('ok');
    const shellResultId = await runToolCallDirect({ type: 'shell_call', id: 'call-2', action: { commands: ['printf ok'] } }, '/opt/agentx-cli');
    expect(shellResultId.call_id).toBe('call-2');
    const shellResultDefault = await runToolCallDirect({ type: 'shell_call', action: { commands: ['printf ok'] } }, '/opt/agentx-cli');
    expect(shellResultDefault.call_id).toBe('');

    expect(() => toolOutputForCallDirect({ type: 'shell_call', call_id: 'call-bad', action: { commands: ['true'] } }, { type: 'message' })).toThrow('shell_call must return shell_call_output');
    expect(toolOutputForCallDirect({ type: 'shell_call', id: 'call-id-fallback', action: { commands: ['true'] } }, { type: 'shell_call_output', output: [], status: 'completed' })).toMatchObject({ type: 'shell_call_output', call_id: 'call-id-fallback', status: 'completed' });
    expect(toolOutputForCallDirect({ type: 'shell_call', action: { commands: ['true'] } }, { type: 'shell_call_output', output: [], status: 'completed' })).toMatchObject({ type: 'shell_call_output', call_id: '', status: 'completed' });
    expect(toolOutputForCallDirect({ type: 'function_call', id: 'call-3', name: 'search' }, { ok: true })).toEqual({ type: 'function_call_output', call_id: 'call-3', output: '{\"ok\":true}' });
    expect(toolOutputForCallDirect({ type: 'function_call', call_id: 'call-4', name: 'search' }, 'done')).toEqual({ type: 'function_call_output', call_id: 'call-4', output: 'done' });
    expect(toolOutputForCallDirect({ type: 'function_call', name: 'search' }, null)).toEqual({ type: 'function_call_output', call_id: '', output: '' });
    expect(toolOutputForCallDirect({ type: 'other', call_id: 'call-5' }, 42)).toEqual({ type: 'function_call_output', call_id: 'call-5', output: '42' });
    expect(toolOutputForCallDirect({ type: 'other' }, null)).toEqual({ type: 'function_call_output', call_id: '', output: '' });
    expect(await runToolCallDirect({ type: 'unknown' }, '/opt/agentx-cli')).toBe('ERROR: unsupported tool unknown');
    expect(await runToolCallDirect({}, '/opt/agentx-cli')).toBe('ERROR: unsupported tool undefined');
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
    const originalStdoutWrite = process.stdout.write;
    process.stdout.write = () => true;
    try {
      expect(await runToolCallDirect({ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'] } }, tmp)).toMatchObject({
        type: 'shell_call_output',
        call_id: 'call-1',
        status: 'completed',
      });
      expect(await runToolCallDirect({ name: 'unknown', arguments: '' }, tmp)).toBe('ERROR: unsupported tool unknown');
      expect(toolCallSummaryDirect({ type: 'shell_call', call_id: 'call-1', action: { commands: ['printf ok'] } }, { type: 'shell_call_output', output: [{ stdout: 'ok', stderr: '', outcome: { type: 'exit', exit_code: 0 } }] })).toBe('printf ok');
    } finally {
      process.stdout.write = originalStdoutWrite;
    }
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
