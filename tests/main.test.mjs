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


  test('agentx.mjs prints quick help and exits for help flags', async () => {
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.exit = jest.fn();
    process.argv = [...process.argv, '--help'];

    try {
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({
        isDirectInvocation: () => true,
        promptPath: '/tmp/prompt.json',
      }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

      await import('../agentx.mjs');

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join('')).toContain('Usage: agentx [--help|-h|-?] [--version|-v] [--debug]');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
    }
  });

  test('agentx.mjs prints the package version and exits for version flags', async () => {
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.exit = jest.fn();
    process.argv = [...process.argv, '--version'];

    try {
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({
        isDirectInvocation: () => true,
        promptPath: '/tmp/prompt.json',
      }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

      await import('../agentx.mjs');

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join('')).toContain('1.1.10');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
    }
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
