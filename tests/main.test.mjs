import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import path from 'node:path';
import * as realFs from 'node:fs';
import { getPackageVersion } from '../src/cli.mjs';

const packageVersion = getPackageVersion();

describe('entrypoint', () => {
  beforeEach(() => {
    jest.resetModules();
  });


  test('agentx.mjs loads .agentx from the user home directory', async () => {
    const config = jest.fn();

    await jest.unstable_mockModule('dotenv', () => ({
      config,
    }));
    await jest.unstable_mockModule('../src/runtime.mjs', () => ({
      isDirectInvocation: () => false,
      promptPath: '/tmp/prompt.json',
    }));
    const runAgent = jest.fn();
    await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

    await import('../agentx.mjs');

    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({ path: path.join(process.env.HOME || process.env.USERPROFILE || '', '.agentx'), quiet: true });
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
      expect(writes.join('')).toContain(packageVersion);
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
    }
  });

  test('agentx.mjs prints startup errors and exits non-zero', async () => {
    const writes = [];
    const originalErrWrite = process.stderr.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.exit = jest.fn();
    process.argv = [...process.argv];

    try {
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({
        isDirectInvocation: () => true,
        promptPath: '/tmp/prompt.json',
      }));
      const runAgent = jest.fn().mockRejectedValue(new Error('missing API key'));
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

      await import('../agentx.mjs');

      expect(runAgent).toHaveBeenCalledWith({ promptPath: '/tmp/prompt.json', cwd: process.cwd() });
      expect(writes.join('')).toContain('missing API key');
      expect(process.exit).toHaveBeenCalledWith(1);
    } finally {
      process.stderr.write = originalErrWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
    }
  });

  test('agentx.mjs prints string startup errors using fallback coercion', async () => {
    const writes = [];
    const originalErrWrite = process.stderr.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.exit = jest.fn();
    process.argv = [...process.argv];

    try {
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({
        isDirectInvocation: () => true,
        promptPath: '/tmp/prompt.json',
      }));
      const runAgent = jest.fn().mockRejectedValue('boom');
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

      await import('../agentx.mjs');

      expect(writes.join('')).toContain('boom');
      expect(process.exit).toHaveBeenCalledWith(1);
    } finally {
      process.stderr.write = originalErrWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
    }
  });

  test('agentx.mjs exercises the interactive setup decline path', async () => {
    const oldEnv = process.env.NODE_ENV; const oldIn = process.stdin.isTTY; const oldOut = process.stdout.isTTY;
    process.env.NODE_ENV = '';
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    try {
      const rl = { question: jest.fn().mockResolvedValue('n'), close: jest.fn() };
      await jest.unstable_mockModule('node:readline/promises', () => ({ createInterface: () => rl }));
      await jest.unstable_mockModule('node:fs', () => ({ ...realFs, existsSync: () => false }));
      await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => '' }));
      await jest.unstable_mockModule('dotenv', () => ({ config: jest.fn() }));
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn().mockResolvedValue(undefined);
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));
      await import('../agentx.mjs');
      expect(rl.question).toHaveBeenCalled(); expect(runAgent).toHaveBeenCalled();
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: oldIn });
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: oldOut });
    }
  });

  test('agentx.mjs exercises successful interactive setup', async () => {
    const oldEnv = process.env.NODE_ENV; const oldIn = process.stdin.isTTY; const oldOut = process.stdout.isTTY;
    const oldKey = process.env.agentx_api_key; process.env.NODE_ENV = ''; delete process.env.agentx_api_key; delete process.env.AGENTX_API_KEY;
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    try {
      const rl = { question: jest.fn().mockResolvedValue('yes'), close: jest.fn() }; const envPath = '/tmp/.agentx-test';
      await jest.unstable_mockModule('node:readline/promises', () => ({ createInterface: () => rl }));
      await jest.unstable_mockModule('node:fs', () => ({ ...realFs, existsSync: (file) => file === envPath }));
      await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => '' }));
      await jest.unstable_mockModule('dotenv', () => ({ config: jest.fn(({ override }) => { if (override) process.env.agentx_api_key = 'configured'; }) }));
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn().mockResolvedValue(undefined); await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));
      const runSetup = jest.fn().mockResolvedValue(undefined); await jest.unstable_mockModule('../src/setup.mjs', () => ({ runSetup, setupPaths: { envPath } }));
      await import('../agentx.mjs');
      expect(runSetup).toHaveBeenCalled(); expect(runAgent).toHaveBeenCalled();
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
      if (oldKey === undefined) delete process.env.agentx_api_key; else process.env.agentx_api_key = oldKey;
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: oldIn }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: oldOut });
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
