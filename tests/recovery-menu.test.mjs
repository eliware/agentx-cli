import { describe, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { OPTIONS, promptRecoveryMenu } from '../src/recovery-menu.mjs';

function makeIO() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.setRawMode = jest.fn();
  input.resume = jest.fn();
  const output = { write: jest.fn() };
  return { input, output };
}

describe('recovery menu', () => {
  test('returns continue when noninteractive', async () => {
    await expect(promptRecoveryMenu(new Error('no tty'), { input: { isTTY: false }, output: {} })).resolves.toBe('continue');
  });

  test('selects numeric options and renders the error', async () => {
    for (const [index, option] of OPTIONS.entries()) {
      const { input, output } = makeIO();
      const prompt = promptRecoveryMenu(new Error('broken'), { input, output, forceInteractive: true });
      process.nextTick(() => input.emit('keypress', String(index + 1), { name: String(index + 1) }));
      await expect(prompt).resolves.toBe(option.id);
      expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('OpenAI request failed: broken'))).toBe(true);
      expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    }
  });

  test('offers debug retry', async () => {
    const { input, output } = makeIO();
    const prompt = promptRecoveryMenu(new Error('broken'), { input, output, forceInteractive: true });
    process.nextTick(() => input.emit('keypress', '2', { name: '2' }));
    await expect(prompt).resolves.toBe('debug-retry');
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('Enable debug mode and retry'))).toBe(true);
  });

  test('moves up/down and accepts enter/return', async () => {
    const { input, output } = makeIO();
    const prompt = promptRecoveryMenu('oops', { input, output, forceInteractive: true });
    process.nextTick(() => {
      input.emit('keypress', '', { name: 'down' });
      input.emit('keypress', '', { name: 'up' });
      input.emit('keypress', '', { name: 'return' });
    });
    await expect(prompt).resolves.toBe('retry');
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('Use 1-6'))).toBe(true);
  });

  test('ignores invalid and empty keys', async () => {
    const { input, output } = makeIO();
    const prompt = promptRecoveryMenu(new Error('bad'), { input, output, forceInteractive: true });
    process.nextTick(() => {
      input.emit('keypress', '0', { name: '0' });
      input.emit('keypress');
      input.emit('keypress', '', { name: 'enter' });
    });
    await expect(prompt).resolves.toBe('retry');
  });

  test('rejects on ctrl-c and restores terminal', async () => {
    const { input, output } = makeIO();
    const prompt = promptRecoveryMenu(new Error('bad'), { input, output, forceInteractive: true });
    process.nextTick(() => input.emit('keypress', '', { name: 'c', ctrl: true }));
    await expect(prompt).rejects.toMatchObject({ name: 'AbortError' });
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('\x1b[?25h'))).toBe(true);
  });
  test('covers default arguments', async () => {
    await expect(promptRecoveryMenu(new Error('bad'))).resolves.toBe('continue');
  });

  test('works with optional terminal methods absent', async () => {
    const input = new EventEmitter();
    input.removeListener = jest.fn((event, listener) => listener('', {}));
    const output = { write: jest.fn() };
    const prompt = promptRecoveryMenu(new Error('bad'), { input, output, forceInteractive: true });
    process.nextTick(() => input.emit('keypress', '1', { name: '1' }));
    await expect(prompt).resolves.toBe('retry');
  });

});

test('cleanup handles an immediate key before first render', async () => {
  const input = { on: jest.fn((event, listener) => listener('1', { name: '1' })), listenerCount: jest.fn(() => 0), setRawMode: jest.fn(), resume: jest.fn() };
  const output = { write: jest.fn() };
  await expect(promptRecoveryMenu(new Error('early'), { input, output, forceInteractive: true })).resolves.toBe('retry');
});

test('evaluates noninteractive capability checks outside Jest', async () => {
  const saved = process.env.JEST_WORKER_ID;
  delete process.env.JEST_WORKER_ID;
  try {
    await expect(promptRecoveryMenu(new Error('no capabilities'), { input: {}, output: {} })).resolves.toBe('continue');
  } finally {
    if (saved === undefined) delete process.env.JEST_WORKER_ID; else process.env.JEST_WORKER_ID = saved;
  }
});

test('returns retry repeatedly when the user explicitly chooses it', async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { input, output } = makeIO();
    const prompt = promptRecoveryMenu(new Error(`transient-${attempt}`), { input, output, forceInteractive: true });
    process.nextTick(() => input.emit('keypress', '1', { name: '1' }));
    await expect(prompt).resolves.toBe('retry');
  }
});
