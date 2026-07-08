import { describe, expect, jest, test } from '@jest/globals';

describe('linux credential authentication helper', () => {
  test('spawns python pam auth and returns parsed results', async () => {
    await jest.isolateModulesAsync(async () => {
      const spawned = [];
      const fakeChild = {
        stdout: { setEncoding: jest.fn(), on: jest.fn() },
        stderr: { setEncoding: jest.fn(), on: jest.fn() },
        stdin: { end: jest.fn() },
        on: jest.fn((event, handler) => {
          fakeChild.handlers[event] = handler;
        }),
        handlers: {},
      };

      await jest.unstable_mockModule('node:child_process', () => ({
        spawn: jest.fn((...args) => {
          spawned.push(args);
          return fakeChild;
        }),
      }));

      const { authenticateLinuxCredentials } = await import('../src/backend/linux-auth.mjs');
      const promise = authenticateLinuxCredentials({ username: 'root', password: 'secret', service: 'login', python: 'python3' });
      fakeChild.stdout.on.mock.calls[0][1](JSON.stringify({ ok: true, code: 0, reason: 'Success' }));
      fakeChild.handlers.close?.(0);
      await expect(promise).resolves.toEqual({ ok: true, code: 0, reason: 'Success' });
      expect(spawned[0][0]).toBe('python3');
      expect(spawned[0][1]).toEqual(['-c', expect.any(String), 'root', 'login']);
      expect(fakeChild.stdin.end).toHaveBeenCalledWith('secret', 'utf8');
    });
  });

  test('rejects missing credentials immediately', async () => {
    await jest.isolateModulesAsync(async () => {
      const { authenticateLinuxCredentials } = await import('../src/backend/linux-auth.mjs');
      await expect(authenticateLinuxCredentials({ username: '', password: '' })).resolves.toMatchObject({ ok: false, code: 'missing_credentials' });
    });
  });
});
