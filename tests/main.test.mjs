import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import path from 'node:path';
import * as realFs from 'node:fs';
import { getPackageVersion } from '../src/cli.mjs';
import { cleanupTempDir, makeTempDir } from './test-helpers.mjs';

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
      expect(writes.join('')).toContain('Usage: agentx [flags] [message...]');
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

  test('agentx.mjs validates a valid MCP config without starting AgentX', async () => {
    const tempHome = makeTempDir('agentx-main-mcp-');
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.exit = jest.fn();
    process.argv = [process.argv[0], process.argv[1], '--check-mcp'];
    realFs.writeFileSync(path.join(tempHome, '.agentx.mcp.json'), JSON.stringify([{ type: 'mcp', server_label: 'test', server_url: 'https://example.test/mcp', headers: { Authorization: 'Bearer hidden' } }]));

    try {
      await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => tempHome }));
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

      await import('../agentx.mjs');

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join('')).toContain('MCP config valid: 1 MCP tool configured');
      expect(writes.join('')).not.toContain('hidden');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
      cleanupTempDir(tempHome);
    }
  });

  test('agentx.mjs returns failure for invalid MCP config', async () => {
    const tempHome = makeTempDir('agentx-main-mcp-invalid-');
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.exit = jest.fn();
    process.argv = [process.argv[0], process.argv[1], '-K'];
    realFs.writeFileSync(path.join(tempHome, '.agentx.mcp.json'), JSON.stringify([{ type: 'mcp', server_label: 'bad', server_url: 'http://bad/mcp' }]));

    try {
      await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => tempHome }));
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

      await import('../agentx.mjs');

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join('')).toContain('MCP config invalid');
      expect(process.exit).toHaveBeenCalledWith(1);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
      cleanupTempDir(tempHome);
    }
  });

  test('agentx.mjs checks MCP config from the launch directory when home is unavailable', async () => {
    const tempHome = makeTempDir('agentx-main-mcp-cwd-');
    const originalCwd = process.cwd();
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    realFs.writeFileSync(path.join(tempHome, '.agentx.mcp.json'), '[]');
    process.chdir(tempHome);
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.exit = jest.fn();
    process.argv = [process.argv[0], process.argv[1], '--check-mcp'];

    try {
      await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => '' }));
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

      await import('../agentx.mjs');

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join('')).toContain('no MCP tools configured');
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      process.chdir(originalCwd);
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
      cleanupTempDir(tempHome);
    }
  });

  test('agentx.mjs rejects a missing cwd value', async () => {
    const writes = [];
    const originalErrWrite = process.stderr.write;
    const originalExitCode = process.exitCode;
    const originalArgv = [...process.argv];
    process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.exitCode = undefined;
    process.argv = [...process.argv, '--cwd'];

    try {
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

      await import('../agentx.mjs');

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join('')).toContain('--cwd requires a path');
      expect(process.exitCode).toBe(1);
    } finally {
      process.stderr.write = originalErrWrite;
      process.exitCode = originalExitCode;
      process.argv = originalArgv;
    }
  });

  test('agentx.mjs resolves an explicit cwd for one-shot messages', async () => {
    const originalArgv = [...process.argv];
    process.argv = [process.argv[0], process.argv[1], '--cwd', '/tmp', 'show', 'cwd'];

    try {
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn().mockResolvedValue(undefined);
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

      await import('../agentx.mjs');

      expect(runAgent).toHaveBeenCalledWith({ promptPath: '/tmp/prompt.json', cwd: path.resolve(process.cwd(), '/tmp'), flags: expect.any(Object), initialMessage: 'show cwd', oneShot: true });
    } finally {
      process.argv = originalArgv;
    }
  });

  test('agentx.mjs prints startup errors and exits non-zero', async () => {
    const writes = [];
    const originalErrWrite = process.stderr.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    const originalExitCode = process.exitCode;
    process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
    process.exit = jest.fn();
    process.argv = [process.argv[0], process.argv[1]];

    try {
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({
        isDirectInvocation: () => true,
        promptPath: '/tmp/prompt.json',
      }));
      const runAgent = jest.fn().mockRejectedValue(new Error('missing API key'));
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));

      await import('../agentx.mjs');

      expect(runAgent).toHaveBeenCalledWith({ promptPath: '/tmp/prompt.json', cwd: process.cwd(), flags: expect.any(Object) });
      expect(writes.join('')).toContain('missing API key');
      expect(process.exitCode).toBe(1);
    } finally {
      process.stderr.write = originalErrWrite;
      process.exit = originalExit;
      process.exitCode = originalExitCode;
      process.argv = originalArgv;
    }
  });

  test('agentx.mjs prints string startup errors using fallback coercion', async () => {
    const writes = [];
    const originalErrWrite = process.stderr.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    const originalExitCode = process.exitCode;
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
      expect(process.exitCode).toBe(1);
    } finally {
      process.stderr.write = originalErrWrite;
      process.exit = originalExit;
      process.exitCode = originalExitCode;
      process.argv = originalArgv;
    }
  });

  test('agentx.mjs skips setup when stdin is not a TTY', async () => {
    const oldEnv = process.env.NODE_ENV; const oldIn = process.stdin.isTTY; const oldOut = process.stdout.isTTY; const oldArgv = process.argv;
    process.env.NODE_ENV = ''; process.argv = [process.argv[0], process.argv[1]];
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    try {
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn().mockResolvedValue(undefined);
      await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));
      await import('../agentx.mjs');
      expect(runAgent).toHaveBeenCalledWith({ promptPath: '/tmp/prompt.json', cwd: process.cwd(), flags: expect.any(Object) });
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: oldIn }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: oldOut }); process.argv = oldArgv;
    }
  });

  test('agentx.mjs skips setup when an API key already exists in config', async () => {
    const oldEnv = process.env.NODE_ENV; const oldIn = process.stdin.isTTY; const oldOut = process.stdout.isTTY; const oldArgv = process.argv; const oldKey = process.env.agentx_api_key;
    process.env.NODE_ENV = ''; process.env.agentx_api_key = 'configured'; process.argv = [process.argv[0], process.argv[1]];
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    try {
      const rl = { question: jest.fn(), close: jest.fn() };
      await jest.unstable_mockModule('node:readline/promises', () => ({ createInterface: () => rl }));
      await jest.unstable_mockModule('node:fs', () => ({ ...realFs, existsSync: () => true }));
      await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => '/tmp/home' }));
      await jest.unstable_mockModule('dotenv', () => ({ config: jest.fn() }));
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn().mockResolvedValue(undefined); await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));
      await import('../agentx.mjs');
      expect(rl.question).not.toHaveBeenCalled(); expect(runAgent).toHaveBeenCalled();
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
      if (oldKey === undefined) delete process.env.agentx_api_key; else process.env.agentx_api_key = oldKey;
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: oldIn }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: oldOut }); process.argv = oldArgv;
    }
  });

  test('agentx.mjs continues when setup completes without an API key', async () => {
    const oldEnv = process.env.NODE_ENV; const oldIn = process.stdin.isTTY; const oldOut = process.stdout.isTTY; const oldArgv = process.argv; const oldKey = process.env.agentx_api_key;
    process.env.NODE_ENV = ''; delete process.env.agentx_api_key; delete process.env.AGENTX_API_KEY; process.argv = [process.argv[0], process.argv[1]];
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    try {
      const rl = { question: jest.fn().mockResolvedValue('yes'), close: jest.fn() };
      await jest.unstable_mockModule('node:readline/promises', () => ({ createInterface: () => rl }));
      await jest.unstable_mockModule('node:fs', () => ({ ...realFs, existsSync: () => false }));
      await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => '' }));
      await jest.unstable_mockModule('dotenv', () => ({ config: jest.fn() }));
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn().mockResolvedValue(undefined); await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));
      const runSetup = jest.fn().mockResolvedValue(undefined); await jest.unstable_mockModule('../src/setup.mjs', () => ({ runSetup, setupPaths: { envPath: '/tmp/missing-agentx' } }));
      await import('../agentx.mjs');
      expect(runSetup).toHaveBeenCalled(); expect(runAgent).toHaveBeenCalled();
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
      if (oldKey === undefined) delete process.env.agentx_api_key; else process.env.agentx_api_key = oldKey;
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: oldIn }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: oldOut }); process.argv = oldArgv;
    }
  });

  test('agentx.mjs exercises the interactive setup decline path', async () => {
    const oldEnv = process.env.NODE_ENV; const oldIn = process.stdin.isTTY; const oldOut = process.stdout.isTTY; const oldArgv = process.argv; process.argv = [process.argv[0], process.argv[1]];
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
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: oldOut }); process.argv = oldArgv;
    }
  });

  test('agentx.mjs prompts when config exists without an API key', async () => {
    const oldEnv = process.env.NODE_ENV; const oldIn = process.stdin.isTTY; const oldOut = process.stdout.isTTY; const oldArgv = process.argv; const oldKey = process.env.agentx_api_key;
    process.env.NODE_ENV = ''; delete process.env.agentx_api_key; delete process.env.AGENTX_API_KEY; process.argv = [process.argv[0], process.argv[1]];
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    try {
      const rl = { question: jest.fn().mockResolvedValue('n'), close: jest.fn() };
      await jest.unstable_mockModule('node:readline/promises', () => ({ createInterface: () => rl }));
      await jest.unstable_mockModule('node:fs', () => ({ ...realFs, existsSync: () => true }));
      await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => '/tmp/home' }));
      await jest.unstable_mockModule('dotenv', () => ({ config: jest.fn() }));
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn().mockResolvedValue(undefined); await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));
      await import('../agentx.mjs');
      expect(rl.question).toHaveBeenCalled();
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
      if (oldKey === undefined) delete process.env.agentx_api_key; else process.env.agentx_api_key = oldKey;
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: oldIn }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: oldOut }); process.argv = oldArgv;
    }
  });

  test('agentx.mjs reports setup completion without a loaded key', async () => {
    const oldEnv = process.env.NODE_ENV; const oldIn = process.stdin.isTTY; const oldOut = process.stdout.isTTY; const oldArgv = process.argv; const oldKey = process.env.agentx_api_key;
    process.env.NODE_ENV = ''; delete process.env.agentx_api_key; delete process.env.AGENTX_API_KEY; process.argv = [process.argv[0], process.argv[1]];
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    try {
      const rl = { question: jest.fn().mockResolvedValue('yes'), close: jest.fn() };
      await jest.unstable_mockModule('node:readline/promises', () => ({ createInterface: () => rl }));
      await jest.unstable_mockModule('node:fs', () => ({ ...realFs, existsSync: (file) => file === '/tmp/setup-env' }));
      await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => '' }));
      await jest.unstable_mockModule('dotenv', () => ({ config: jest.fn() }));
      await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
      const runAgent = jest.fn().mockResolvedValue(undefined); await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));
      const runSetup = jest.fn().mockResolvedValue(undefined); await jest.unstable_mockModule('../src/setup.mjs', () => ({ runSetup, setupPaths: { envPath: '/tmp/setup-env' } }));
      await import('../agentx.mjs');
      expect(runSetup).toHaveBeenCalled(); expect(runAgent).toHaveBeenCalled();
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
      if (oldKey === undefined) delete process.env.agentx_api_key; else process.env.agentx_api_key = oldKey;
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: oldIn }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: oldOut }); process.argv = oldArgv;
    }
  });

  test('agentx.mjs exercises successful interactive setup', async () => {
    const oldEnv = process.env.NODE_ENV; const oldIn = process.stdin.isTTY; const oldOut = process.stdout.isTTY; const oldArgv = process.argv; process.argv = [process.argv[0], process.argv[1]];
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
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: oldIn }); Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: oldOut }); process.argv = oldArgv;
    }
  });

  test('agentx.mjs sends positional text as one-shot input', async () => {
    await jest.unstable_mockModule('../src/runtime.mjs', () => ({ isDirectInvocation: () => true, promptPath: '/tmp/prompt.json' }));
    const runAgent = jest.fn().mockResolvedValue(undefined);
    await jest.unstable_mockModule('../src/agent.mjs', () => ({ runAgent }));
    process.argv = [process.argv[0], process.argv[1], 'hello', 'world'];
    await import('../agentx.mjs');
    expect(runAgent).toHaveBeenCalledWith({ promptPath: '/tmp/prompt.json', cwd: process.cwd(), flags: expect.any(Object), initialMessage: 'hello world', oneShot: true });
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
    process.argv = [process.argv[0], process.argv[1]];

    await import('../agentx.mjs');

    expect(runAgent).toHaveBeenCalledWith({ promptPath: '/tmp/prompt.json', cwd: process.cwd(), flags: expect.any(Object) });
  });
});
