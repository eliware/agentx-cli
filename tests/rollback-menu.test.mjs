import { describe, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { promptRollbackMenu } from '../src/rollback-menu.mjs';

const history = [
  { response_id: 'r1', timestamp: '2026-01-01T00:00:00.000Z', user_preview: 'hello world', assistant_preview: 'answer one' },
  { response_id: 'r2', timestamp: '2026-01-02T00:00:00.000Z', user_preview: 'second request', assistant_preview: 'answer two' },
];

function makeIO() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.setRawMode = jest.fn();
  input.resume = jest.fn();
  const output = { write: jest.fn() };
  return { input, output };
}

describe('rollback menu', () => {
  test('returns null without checkpoints or tty', async () => {
    await expect(promptRollbackMenu([])).resolves.toBeNull();
    await expect(promptRollbackMenu(history, { input: { isTTY: false }, output: {} })).resolves.toBeNull();
  });

  test('selects checkpoints and cancel numerically', async () => {
    for (const [key, expected] of [['1', history[0]], ['2', history[1]], ['3', null]]) {
      const { input, output } = makeIO();
      const prompt = promptRollbackMenu(history, { input, output, forceInteractive: true });
      process.nextTick(() => input.emit('keypress', key, { name: key }));
      await expect(prompt).resolves.toEqual(expected);
      expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('Rollback to a successful response checkpoint'))).toBe(true);
      expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    }
  });

  test('moves with arrows, wraps, and accepts enter', async () => {
    const { input, output } = makeIO();
    const prompt = promptRollbackMenu(history, { input, output, forceInteractive: true });
    process.nextTick(() => {
      input.emit('keypress', '', { name: 'up' });
      input.emit('keypress', '', { name: 'down' });
      input.emit('keypress', '', { name: 'down' });
      input.emit('keypress', '', { name: 'return' });
    });
    await expect(prompt).resolves.toBe(history[1]);
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('Use 1-3'))).toBe(true);
  });

  test('ignores invalid and empty keys', async () => {
    const { input, output } = makeIO();
    const prompt = promptRollbackMenu(history, { input, output, forceInteractive: true });
    process.nextTick(() => {
      input.emit('keypress', '0', { name: '0' });
      input.emit('keypress');
      input.emit('keypress', '', { name: 'enter' });
    });
    await expect(prompt).resolves.toBe(history[0]);
  });

  test('rejects on ctrl-c and restores terminal', async () => {
    const { input, output } = makeIO();
    const prompt = promptRollbackMenu(history, { input, output, forceInteractive: true });
    process.nextTick(() => input.emit('keypress', '', { name: 'c', ctrl: true }));
    await expect(prompt).rejects.toMatchObject({ name: 'AbortError' });
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('\x1b[?25h'))).toBe(true);
  });
  test('covers default arguments', async () => {
    await expect(promptRollbackMenu([])).resolves.toBeNull();
  });

  test('works with optional terminal methods absent', async () => {
    const input = new EventEmitter();
    input.removeListener = jest.fn((event, listener) => listener('', {}));
    const output = { write: jest.fn() };
    const prompt = promptRollbackMenu(history, { input, output, forceInteractive: true });
    process.nextTick(() => { input.emit('keypress', '', { name: 'up' }); input.emit('keypress', '', { name: 'down' }); input.emit('keypress', '', { name: 'enter' }); });
    await expect(prompt).resolves.toEqual(history[0]);
  });

});

test('renders missing preview metadata and cancels with Enter', async () => {
  const input = new EventEmitter(); input.isTTY = true; input.setRawMode = jest.fn(); input.resume = jest.fn();
  const output = { write: jest.fn() };
  const prompt = promptRollbackMenu([{ response_id: 'r', user_preview: null, assistant_preview: null }], { input, output, forceInteractive: true });
  process.nextTick(() => { input.emit('keypress', '', { name: 'up' }); input.emit('keypress', '', { name: 'enter' }); });
  await expect(prompt).resolves.toBeNull();
});

test('cleanup handles an immediate key before first render', async () => {
  const input = { on: jest.fn((event, listener) => listener('1', { name: '1' })), listenerCount: jest.fn(() => 0), setRawMode: jest.fn(), resume: jest.fn() };
  const output = { write: jest.fn() };
  await expect(promptRollbackMenu([{ response_id: 'r' }], { input, output, forceInteractive: true })).resolves.toMatchObject({ response_id: 'r' });
});

test('evaluates noninteractive capability checks outside Jest', async () => {
  const saved = process.env.JEST_WORKER_ID;
  delete process.env.JEST_WORKER_ID;
  try {
    await expect(promptRollbackMenu([{ response_id: 'r' }], { input: {}, output: {} })).resolves.toBeNull();
  } finally {
    if (saved === undefined) delete process.env.JEST_WORKER_ID; else process.env.JEST_WORKER_ID = saved;
  }
});
