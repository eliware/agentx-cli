import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function makeShellMock() {
  return {
    buildWorkingDirectoryNote: (nextCwd) => `User changed working directory to ${nextCwd}`,
    clearTerminal: jest.fn(),
    formatPromptForCwd: (nextCwd) => `[AgentX test@dev:${nextCwd}] `,
    formatSystemMessage: (message) => message,
    parseInternalCommand: (message) => {
      if (message === 'clear') return { type: 'clear' };
      if (message === '/clear') return { type: 'session_clear' };
      if (message === '/usage') return { type: 'usage' };
      if (message === 'cd' || message.startsWith('cd ')) return { type: 'cd', target: message.slice(2).trim() };
      if (message === '/exit') return { type: 'exit' };
      return null;
    },
    readAgentsFromCwdAndParents: jest.fn(async () => ''),
    resolveCdTarget: async (target, activeCwd) => {
      if (target === 'missing') {
        throw new Error(`cd: not a directory: ${target}`);
      }
      return path.join(activeCwd, target || 'home');
    },
  };
}

function makeOpenAIMock() {
  return {
    default: class OpenAI {
      constructor() {
        return { responses: {} };
      }
    },
  };
}

describe('agent loop', () => {
  let cwd;
  let promptPath;
  let originalArgv;
  let originalExit;
  let originalStdoutWrite;
  let originalConsoleLog;
  let originalLowerApiKey;
  let originalUpperApiKey;
  let writes;
  let logs;

  beforeEach(() => {
    jest.resetModules();
    cwd = mkdtempSync(path.join(os.tmpdir(), 'agentx-loop-'));
    promptPath = path.join(cwd, 'prompt.json');
    writeFileSync(promptPath, JSON.stringify({
      model: 'test-model',
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
      ],
      tools: [],
    }));
    writeFileSync(path.join(cwd, '.agentx_responseid'), JSON.stringify({
      response_id: 'resp-saved',
      usage: { inputTokens: 10, cachedTokens: 2, outputTokens: 5, turns: 3 },
      last_user_message: 'what time is it?',
      last_assistant_message: 'It is 3pm.',
      pending_cli_transcript: '',
    }));

    originalArgv = [...process.argv];
    process.argv = [...process.argv, '--debug'];

    originalExit = process.exit;
    process.exit = jest.fn();

    originalStdoutWrite = process.stdout.write;
    originalLowerApiKey = process.env.agentx_api_key;
    originalUpperApiKey = process.env.AGENTX_API_KEY;
    process.env.agentx_api_key = 'test-key';
    delete process.env.AGENTX_API_KEY;
    writes = [];
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };

    originalConsoleLog = console.log;
    logs = [];
    console.log = (...args) => {
      logs.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
    console.log = originalConsoleLog;
    if (originalLowerApiKey === undefined) delete process.env.agentx_api_key; else process.env.agentx_api_key = originalLowerApiKey;
    if (originalUpperApiKey === undefined) delete process.env.AGENTX_API_KEY; else process.env.AGENTX_API_KEY = originalUpperApiKey;
    rmSync(cwd, { recursive: true, force: true });
  });

  test('processes commands, handles session resets and runs fresh requests', async () => {
    const questionQueue = ['', 'clear', '/usage', 'cd missing', 'cd nested', 'hello', '/clear', 'fresh', '/exit'];

    await jest.unstable_mockModule('node:readline/promises', () => ({
      createInterface: () => ({
        question: async () => questionQueue.shift() ?? '/exit',
        close: jest.fn(),
      }),
    }));

    await jest.unstable_mockModule('openai', () => makeOpenAIMock());

    await jest.unstable_mockModule('../src/shell.mjs', () => makeShellMock());
    await jest.unstable_mockModule('../src/tool-shell.mjs', () => ({
      shellExec: jest.fn(async (command) => (command === 'ls' ? 'one.txt\ntwo.txt' : 'pwd /tmp/work')),
    }));

    const persistResponseState = jest.fn(async () => { });
    const clearSession = jest.fn(async () => { });
    const readSessionState = jest.fn(async () => ({
      response_id: 'resp-saved',
      usage: { inputTokens: 10, cachedTokens: 2, outputTokens: 5, turns: 3 },
      last_user_message: 'what time is it?',
      last_assistant_message: 'It is 3pm.',
    }));
    const extractTextFromResponse = jest.fn((response) => response?.output?.map?.((item) => item?.content?.map?.((part) => part?.text || '').join('') || '').join('\n') || '');
    const sendMessage = jest.fn(async (_openai, _template, previousResponseId, userMessage, agentsText, activeCwd, onResponseUsage, requestOverride) => {
      if (!previousResponseId) {
        expect(userMessage).toBe('fresh');
        expect(requestOverride.input[0].content[0].text).toContain('base prompt');
        expect(requestOverride.input[0].content[0].text).toContain('AGENTS.md not present');
        expect(requestOverride.input[1].content[0].text).toBe('fresh');
      }

      onResponseUsage({ inputTokens: 3, cachedTokens: 1, outputTokens: 4 });
        return {
          id: previousResponseId ? 'resp-fresh' : 'resp-fresh',
          output: [{ type: 'message', content: [{ type: 'output_text', text: `reply from ${activeCwd}` }] }],
          usage: { input_tokens: 3, input_tokens_details: { cached_tokens: 1 }, output_tokens: 4 },
        };
    });

    await jest.unstable_mockModule('../src/agent-session.mjs', () => ({
      clearSession,
      extractTextFromResponse,
      extractUsage: (response) => response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
      persistResponseState,
      readSessionState,
      sendMessage,
    }));

    const readJson = jest.fn(async () => ({
      model: 'test-model',
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
      ],
      tools: [],
    }));
    await jest.unstable_mockModule('../src/runtime.mjs', () => ({
      readJson,
    }));

    const terminalWidth = 80;
    await jest.unstable_mockModule('../src/text-wrap.mjs', () => ({
      getTerminalWidth: () => terminalWidth,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import('../src/agent.mjs');
    await runAgent({ promptPath, cwd });

    expect(readJson).toHaveBeenCalledWith(promptPath);
    expect(readSessionState).toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(persistResponseState).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(logs.some((line) => line.includes('OpenAI request:'))).toBe(true);
    expect(writes.join(' ')).toContain('AGENTS.md not found');
    expect(writes.join(' ')).toContain('Last user message');
    expect(writes.join(' ')).toContain('what time is it?');
    expect(writes.join(' ')).toContain('Last assistant message');
    expect(writes.join(' ')).toContain('It is 3pm.');
  });

  test('runs direct shell commands locally and prepends them to the next AI request', async () => {
    const questionQueue = ['>ls', '>pwd', 'hello', '/exit'];

    await jest.unstable_mockModule('node:readline/promises', () => ({
      createInterface: () => ({
        question: async () => questionQueue.shift() ?? '/exit',
        close: jest.fn(),
      }),
    }));

    await jest.unstable_mockModule('openai', () => makeOpenAIMock());

    await jest.unstable_mockModule('../src/shell.mjs', () => makeShellMock());
    await jest.unstable_mockModule('../src/tool-shell.mjs', () => ({
      shellExec: jest.fn(async (command) => (command === 'ls' ? 'one.txt\ntwo.txt' : '/tmp/work')),
    }));

    const persistResponseState = jest.fn(async () => { });
    const clearSession = jest.fn(async () => { });
    const readSessionState = jest.fn(async () => null);
    const extractTextFromResponse = jest.fn(() => 'assistant reply');
    const sendMessage = jest.fn(async (_openai, _template, previousResponseId, userMessage, _agentsText, _activeCwd, onResponseUsage, requestOverride) => {
      expect(previousResponseId).toBe('');
      expect(userMessage).toContain('Local shell commands and output since the last assistant message:');
      expect(userMessage).toContain('> ls');
      expect(userMessage).toContain('one.txt');
      expect(userMessage).toContain('> pwd');
      expect(userMessage).toContain('/tmp/work');
      expect(requestOverride.input[1].content[0].text).toContain('> ls');
      expect(requestOverride.input[1].content[0].text).toContain('> pwd');
      onResponseUsage({ inputTokens: 1, cachedTokens: 0, outputTokens: 1 });
      return {
        id: 'resp-1',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    });

    await jest.unstable_mockModule('../src/agent-session.mjs', () => ({
      clearSession,
      extractTextFromResponse,
      extractUsage: (response) => response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
      persistResponseState,
      readSessionState,
      sendMessage,
    }));

    await jest.unstable_mockModule('../src/runtime.mjs', () => ({
      readJson: async () => ({
        model: 'test-model',
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
          { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
        ],
        tools: [],
      }),
    }));

    await jest.unstable_mockModule('../src/text-wrap.mjs', () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import('../src/agent.mjs');
    await runAgent({ promptPath, cwd });

    expect(persistResponseState).toHaveBeenCalledTimes(3);
    expect(persistResponseState.mock.calls[0][1]).toMatchObject({
      response_id: '',
      pending_cli_transcript: '> ls\none.txt\ntwo.txt',
    });
    expect(persistResponseState.mock.calls[1][1]).toMatchObject({
      response_id: '',
      pending_cli_transcript: '> ls\none.txt\ntwo.txt\n\n> pwd\n/tmp/work',
    });
    expect(persistResponseState.mock.calls[2][1]).toMatchObject({
      response_id: 'resp-1',
      pending_cli_transcript: '',
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(writes.join(' ')).toContain('Running shell command: ls');
    expect(writes.join(' ')).toContain('Running shell command: pwd');
    expect(writes.join(' ')).toContain('one.txt');
    expect(writes.join(' ')).toContain('/tmp/work');
  });


  test('sums usage across tool retriggers in the persisted session totals', async () => {
    const questionQueue = ['hello', '/exit'];

    await jest.unstable_mockModule('node:readline/promises', () => ({
      createInterface: () => ({
        question: async () => questionQueue.shift() ?? '/exit',
        close: jest.fn(),
      }),
    }));

    await jest.unstable_mockModule('openai', () => makeOpenAIMock());

    await jest.unstable_mockModule('../src/shell.mjs', () => makeShellMock());
    await jest.unstable_mockModule('../src/tool-shell.mjs', () => ({
      shellExec: jest.fn(),
    }));

    const persistResponseState = jest.fn(async () => { });
    const clearSession = jest.fn(async () => { });
    const readSessionState = jest.fn(async () => null);
    const extractTextFromResponse = jest.fn(() => 'assistant reply');
    const sendMessage = jest.fn(async (_openai, _template, previousResponseId, _userMessage, _agentsText, _activeCwd, onResponseUsage) => {
      expect(previousResponseId).toBe('');
      onResponseUsage({ inputTokens: 10, cachedTokens: 1, outputTokens: 2 });
      onResponseUsage({ inputTokens: 20, cachedTokens: 2, outputTokens: 4 });
      onResponseUsage({ inputTokens: 30, cachedTokens: 3, outputTokens: 6 });
      onResponseUsage({ inputTokens: 40, cachedTokens: 4, outputTokens: 8 });
      onResponseUsage({ inputTokens: 50, cachedTokens: 5, outputTokens: 10 });
      return {
        id: 'resp-5',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
        usage: { input_tokens: 50, input_tokens_details: { cached_tokens: 5 }, output_tokens: 10 },
      };
    });

    await jest.unstable_mockModule('../src/agent-session.mjs', () => ({
      clearSession,
      extractTextFromResponse,
      extractUsage: (response) => response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
      persistResponseState,
      readSessionState,
      sendMessage,
    }));

    await jest.unstable_mockModule('../src/runtime.mjs', () => ({
      readJson: async () => ({
        model: 'test-model',
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: 'base prompt' }] },
          { role: 'user', content: [{ type: 'input_text', text: 'first user message' }] },
        ],
        tools: [],
      }),
    }));

    await jest.unstable_mockModule('../src/text-wrap.mjs', () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import('../src/agent.mjs');
    await runAgent({ promptPath, cwd });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(persistResponseState).toHaveBeenCalled();
    expect(persistResponseState.mock.calls.at(-1)[1]).toMatchObject({
      response_id: 'resp-5',
      usage: { inputTokens: 150, cachedTokens: 15, outputTokens: 30, turns: 5 },
    });
    expect(writes.join(' ')).toContain('msgs=5');
  });

  test('exits cleanly when readline aborts', async () => {
    await jest.unstable_mockModule('node:readline/promises', () => ({
      createInterface: () => ({
        question: async () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          throw error;
        },
        close: jest.fn(),
      }),
    }));

    await jest.unstable_mockModule('openai', () => makeOpenAIMock());

    await jest.unstable_mockModule('../src/shell.mjs', () => makeShellMock());
    await jest.unstable_mockModule('../src/tool-shell.mjs', () => ({
      shellExec: jest.fn(async (command) => (command === 'ls' ? 'one.txt\ntwo.txt' : 'pwd /tmp/work')),
    }));

    const noop = jest.fn(async () => { });
    await jest.unstable_mockModule('../src/agent-session.mjs', () => ({
      clearSession: noop,
      extractTextFromResponse: () => '',
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
      persistResponseState: noop,
      readSessionState: async () => null,
      sendMessage: noop,
    }));

    await jest.unstable_mockModule('../src/runtime.mjs', () => ({
      readJson: async () => ({
        model: 'test-model',
        input: [],
        tools: [],
      }),
    }));

    await jest.unstable_mockModule('../src/text-wrap.mjs', () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import('../src/agent.mjs');
    await runAgent({ promptPath, cwd });

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(writes.join(' ')).toContain('Starting new session');
  });

  test('propagates unexpected readline errors', async () => {
    await jest.unstable_mockModule('node:readline/promises', () => ({
      createInterface: () => ({
        question: async () => {
          throw new Error('boom');
        },
        close: jest.fn(),
      }),
    }));

    await jest.unstable_mockModule('openai', () => makeOpenAIMock());

    await jest.unstable_mockModule('../src/shell.mjs', () => makeShellMock());
    await jest.unstable_mockModule('../src/tool-shell.mjs', () => ({
      shellExec: jest.fn(async (command) => (command === 'ls' ? 'one.txt\ntwo.txt' : 'pwd /tmp/work')),
    }));

    const noop = jest.fn(async () => { });
    await jest.unstable_mockModule('../src/agent-session.mjs', () => ({
      clearSession: noop,
      extractTextFromResponse: () => '',
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
      persistResponseState: noop,
      readSessionState: async () => null,
      sendMessage: noop,
    }));

    await jest.unstable_mockModule('../src/runtime.mjs', () => ({
      readJson: async () => ({
        model: 'test-model',
        input: [],
        tools: [],
      }),
    }));

    await jest.unstable_mockModule('../src/text-wrap.mjs', () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import('../src/agent.mjs');
    await expect(runAgent({ promptPath, cwd })).rejects.toThrow('boom');
  });
});
