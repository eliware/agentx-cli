import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('agentx-setup entrypoint', () => {
  let originalArgv;
  let originalExit;
  let originalStderrWrite;

  beforeEach(() => {
    jest.resetModules();
    originalArgv = [...process.argv];
    originalExit = process.exit;
    originalStderrWrite = process.stderr.write;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    process.stderr.write = originalStderrWrite;
  });

  test('does not start setup when imported indirectly', async () => {
    const runSetup = jest.fn();
    await jest.unstable_mockModule('../src/setup.mjs', () => ({ runSetup }));

    await import('../agentx-setup.mjs');

    expect(runSetup).not.toHaveBeenCalled();
  });

  test('skips startup when no entrypoint argv is present', async () => {
    const runSetup = jest.fn();
    await jest.unstable_mockModule('../src/setup.mjs', () => ({ runSetup }));
    process.argv = [process.argv[0]];

    await import('../agentx-setup.mjs');

    expect(runSetup).not.toHaveBeenCalled();
  });

  test('invokes setup when run as the entrypoint', async () => {
    const runSetup = jest.fn().mockResolvedValue(undefined);
    await jest.unstable_mockModule('node:fs', () => ({ default: { realpathSync: () => '/opt/agentx-cli/agentx-setup.mjs' }, realpathSync: () => '/opt/agentx-cli/agentx-setup.mjs' }));
    await jest.unstable_mockModule('../src/setup.mjs', () => ({ runSetup }));
    process.argv = [...process.argv.slice(0, 1), '/opt/agentx-cli/agentx-setup.mjs'];

    await import('../agentx-setup.mjs');

    expect(runSetup).toHaveBeenCalledWith({ cwd: process.cwd() });
  });

  test('prints setup errors and exits non-zero', async () => {
    const runSetup = jest.fn().mockRejectedValue({ toString: () => 'fallback error' });
    const writes = [];
    process.stderr.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exit = jest.fn();
    await jest.unstable_mockModule('node:fs', () => ({ default: { realpathSync: () => '/opt/agentx-cli/agentx-setup.mjs' }, realpathSync: () => '/opt/agentx-cli/agentx-setup.mjs' }));
    await jest.unstable_mockModule('../src/setup.mjs', () => ({ runSetup }));
    process.argv = [...process.argv.slice(0, 1), '/opt/agentx-cli/agentx-setup.mjs'];

    await import('../agentx-setup.mjs');

    expect(writes.join('')).toContain('fallback error');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
