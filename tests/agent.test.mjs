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
      if (message === '/compact') return { type: 'compact' };
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

describe('agent loop', () => {
  let cwd;
  let promptPath;
  let originalArgv;
  let originalExit;
  let originalStdoutWrite;
  let originalConsoleLog;
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
    }));

    originalArgv = [...process.argv];
    process.argv = [...process.argv, '--debug'];

    originalExit = process.exit;
    process.exit = jest.fn();

    originalStdoutWrite = process.stdout.write;
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
    rmSync(cwd, { recursive: true, force: true });
  });

  test('processes commands, retries after context errors and resets sessions', async () => {
    const questionQueue = ['', 'clear', '/usage', 'cd missing', 'cd nested', 'hello', '/compact', '/clear', '/compact', 'fresh', '/exit'];

    await jest.unstable_mockModule('node:readline/promises', () => ({
      createInterface: () => ({
        question: async () => questionQueue.shift() ?? '/exit',
        close: jest.fn(),
      }),
    }));

    await jest.unstable_mockModule('@eliware/openai', () => ({
      createOpenAI: jest.fn(async () => ({ responses: {} })),
    }));

    await jest.unstable_mockModule('../src/shell.mjs', () => makeShellMock());

    const persistResponseState = jest.fn(async () => {});
    const clearSession = jest.fn(async () => {});
    const readSessionState = jest.fn(async () => ({
      response_id: 'resp-saved',
      usage: { inputTokens: 10, cachedTokens: 2, outputTokens: 5, turns: 3 },
    }));
    const extractTextFromResponse = jest.fn((response) => response?.output?.map?.((item) => item?.content?.map?.((part) => part?.text || '').join('') || '').join('\n') || '');
    const isContextWindowExceeded = jest.fn((error) => error?.code === 'context_length_exceeded');
    const sendMessage = jest.fn(async (_openai, _template, previousResponseId, userMessage, agentsText, activeCwd, onResponseUsage, requestOverride) => {
      if (previousResponseId === 'resp-saved') {
        onResponseUsage({ inputTokens: 1, cachedTokens: 0, outputTokens: 2 });
        const error = new Error('context window exceeded');
        error.code = 'context_length_exceeded';
        throw error;
      }

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
    const compactSession = jest.fn(async (_openai, _template, previousResponseId, _agentsText, activeCwd, pendingMessage, onResponseUsage) => {
      onResponseUsage({ inputTokens: 2, cachedTokens: 0, outputTokens: 3 });
      return {
        response: {
          id: previousResponseId === 'resp-saved' ? 'resp-fallback' : 'resp-compact',
          output: [{ type: 'message', content: [{ type: 'output_text', text: `compacted ${pendingMessage || activeCwd}` }] }],
          usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens: 3 },
        },
        summary: 'summary text',
        recentCount: 1,
        summarizedCount: 1,
      };
    });

    await jest.unstable_mockModule('../src/agent-session.mjs', () => ({
      clearSession,
      compactSession,
      extractTextFromResponse,
      extractUsage: (response) => response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
      isContextWindowExceeded,
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
    expect(compactSession).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(persistResponseState).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(logs.some((line) => line.includes('OpenAI request:'))).toBe(true);
    expect(writes.join(' ')).toContain('AGENTS.md not found');
    expect(writes.join(' ')).toContain('No active session to compact');
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

    await jest.unstable_mockModule('@eliware/openai', () => ({
      createOpenAI: jest.fn(async () => ({ responses: {} })),
    }));

    await jest.unstable_mockModule('../src/shell.mjs', () => makeShellMock());

    const noop = jest.fn(async () => {});
    await jest.unstable_mockModule('../src/agent-session.mjs', () => ({
      clearSession: noop,
      compactSession: noop,
      extractTextFromResponse: () => '',
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
      isContextWindowExceeded: () => false,
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

    await jest.unstable_mockModule('@eliware/openai', () => ({
      createOpenAI: jest.fn(async () => ({ responses: {} })),
    }));

    await jest.unstable_mockModule('../src/shell.mjs', () => makeShellMock());

    const noop = jest.fn(async () => {});
    await jest.unstable_mockModule('../src/agent-session.mjs', () => ({
      clearSession: noop,
      compactSession: noop,
      extractTextFromResponse: () => '',
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
      isContextWindowExceeded: () => false,
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
