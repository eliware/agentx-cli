import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('entrypoint', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('agentx.mjs does not start the REPL when invoked indirectly', async () => {
    await jest.unstable_mockModule('../src/runtime.mjs', () => ({
      isDirectInvocation: () => false,
      promptPath: '/tmp/prompt.json',
    }));
    const runAgent = jest.fn();
    await jest.unstable_mockModule('../src/agent.mjs', () => ({
      runAgent,
    }));

    await import('../agentx.mjs');

    expect(runAgent).not.toHaveBeenCalled();
  });

  test('agentx.mjs starts the REPL when invoked directly', async () => {
    await jest.unstable_mockModule('../src/runtime.mjs', () => ({
      isDirectInvocation: () => true,
      promptPath: '/tmp/prompt.json',
    }));
    const runAgent = jest.fn().mockResolvedValue(undefined);
    await jest.unstable_mockModule('../src/agent.mjs', () => ({
      runAgent,
    }));

    await import('../agentx.mjs');

    expect(runAgent).toHaveBeenCalledWith({ promptPath: '/tmp/prompt.json', cwd: process.cwd() });
  });
});
