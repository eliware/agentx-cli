import { beforeEach, describe, expect, jest, test } from '@jest/globals';

function createFakeChild() {
  const fakeChild = {
    stdout: { setEncoding: jest.fn(), on: jest.fn() },
    stderr: { setEncoding: jest.fn(), on: jest.fn() },
    stdin: { end: jest.fn() },
    on: jest.fn((event, handler) => {
      fakeChild.handlers[event] = handler;
    }),
    handlers: {},
  };

  return fakeChild;
}

async function loadModule(spawn) {
  await jest.unstable_mockModule('node:child_process', () => ({ spawn }));
  return import('../src/backend/linux-auth.mjs');
}

beforeEach(() => {
  jest.resetModules();
});

describe('linux credential authentication helper', () => {
  test('spawns python pam auth and returns parsed results', async () => {
    const spawned = [];
    const fakeChild = createFakeChild();
    const { authenticateLinuxCredentials } = await loadModule(jest.fn((...args) => {
      spawned.push(args);
      return fakeChild;
    }));

    const promise = authenticateLinuxCredentials({ username: 'root', password: 'secret', service: 'login', python: 'python3' });
    fakeChild.stdout.on.mock.calls[0][1](JSON.stringify({ ok: true, code: 0, reason: 'Success' }));
    fakeChild.handlers.close?.(0);

    await expect(promise).resolves.toEqual({ ok: true, code: 0, reason: 'Success' });
    expect(spawned[0][0]).toBe('python3');
    expect(spawned[0][1]).toEqual(['-c', expect.any(String), 'root', 'login']);
    expect(fakeChild.stdin.end).toHaveBeenCalledWith('secret', 'utf8');
  });

  test('uses default service and python when omitted', async () => {
    const spawned = [];
    const fakeChild = createFakeChild();
    const { authenticateLinuxCredentials } = await loadModule(jest.fn((...args) => {
      spawned.push(args);
      return fakeChild;
    }));

    const promise = authenticateLinuxCredentials({ username: 'root', password: 'secret' });
    fakeChild.stdout.on.mock.calls[0][1](JSON.stringify({ ok: true, code: 0, reason: '' }));
    fakeChild.stderr.on.mock.calls[0][1]('fallback reason');
    fakeChild.handlers.close?.(0);

    await expect(promise).resolves.toEqual({ ok: true, code: 0, reason: 'fallback reason' });
    expect(spawned[0][0]).toBe('python3');
    expect(spawned[0][1]).toEqual(['-c', expect.any(String), 'root', 'login']);
  });

  test('rejects missing credentials immediately', async () => {
    const { authenticateLinuxCredentials } = await loadModule(jest.fn());
    await expect(authenticateLinuxCredentials()).resolves.toMatchObject({ ok: false, code: 'missing_credentials' });
  });

  test('returns an authentication error when python emits no stdout', async () => {
    const fakeChild = createFakeChild();
    const { authenticateLinuxCredentials } = await loadModule(jest.fn(() => fakeChild));
    const promise = authenticateLinuxCredentials({ username: 'root', password: 'secret' });
    fakeChild.handlers.close?.();

    await expect(promise).resolves.toEqual({
      ok: false,
      code: 'authentication_error',
      reason: 'python auth exited with code unknown',
    });
  });


  test('returns null reason when python auth provides no reason or stderr', async () => {
    const fakeChild = createFakeChild();
    const { authenticateLinuxCredentials } = await loadModule(jest.fn(() => fakeChild));
    const promise = authenticateLinuxCredentials({ username: 'root', password: 'secret' });
    fakeChild.stdout.on.mock.calls[0][1](JSON.stringify({ ok: false, code: 1, reason: '' }));
    fakeChild.handlers.close?.(0);

    await expect(promise).resolves.toEqual({ ok: false, code: 1, reason: null });
  });

  test('rejects invalid JSON from python auth', async () => {
    const fakeChild = createFakeChild();
    const { authenticateLinuxCredentials } = await loadModule(jest.fn(() => fakeChild));
    const promise = authenticateLinuxCredentials({ username: 'root', password: 'secret' });
    fakeChild.stdout.on.mock.calls[0][1]('not-json');
    fakeChild.handlers.close?.(0);

    await expect(promise).rejects.toThrow(SyntaxError);
  });
});
