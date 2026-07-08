import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { attachKeypressListener, callIfFunction, createFrameRenderer, promptResumeMenu } from '../src/resume-menu.mjs';

function makeIO() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.setRawMode = jest.fn();
  input.resume = jest.fn();
  const output = { write: jest.fn() };
  return { input, output };
}

describe('resume menu', () => {

  test('ignores out-of-range numeric shortcuts before resolving', async () => {
    const { input, output } = makeIO();
    const prompt = promptResumeMenu({ response_id: 'resp-7' }, { input, output });
    process.nextTick(() => {
      input.emit('keypress', '5', { name: '5' });
      input.emit('keypress', '1', { name: '1' });
    });
    await expect(prompt).resolves.toBe('interrupt-retry');
  });

  test('ignores empty keypresses before accepting a numeric shortcut', async () => {
    const { input, output } = makeIO();
    const prompt = promptResumeMenu({ response_id: 'resp-6' }, { input, output });
    process.nextTick(() => {
      input.emit('keypress');
      input.emit('keypress', '2', { name: '2' });
    });
    await expect(prompt).resolves.toBe('interrupt-request');
  });

  test('uses default input and output arguments when options are omitted', async () => {
    await expect(promptResumeMenu({ response_id: 'resp-0' })).resolves.toBe('interrupt-retry');
  });

  test('frame renderer clears both when populated and when already empty', () => {
    const output = { write: jest.fn() };
    const frame = createFrameRenderer(output);
    frame.clear();
    expect(output.write).not.toHaveBeenCalled();
    frame.render(['one', 'two']);
    frame.clear();
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('\x1b[1A\r\x1b[0J'))).toBe(true);
  });


  test('callIfFunction handles present and missing functions', () => {
    const fn = jest.fn(() => 'ok');
    expect(callIfFunction(fn, 1, 2)).toBe('ok');
    expect(fn).toHaveBeenCalledWith(1, 2);
    expect(callIfFunction(undefined, 1, 2)).toBeUndefined();
  });

  test('attachKeypressListener handles present and missing on methods', () => {
    const on = jest.fn();
    attachKeypressListener({ on }, () => {});
    expect(on).toHaveBeenCalledWith('keypress', expect.any(Function));
    expect(() => attachKeypressListener({}, () => {})).not.toThrow();
  });

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });


  test('defaults to the first option when input is not interactive', async () => {
    await expect(promptResumeMenu({ response_id: 'resp-5' }, { input: {}, output: {} })).resolves.toBe('interrupt-retry');
  });

  test('selects options with number keys', async () => {
    const { input, output } = makeIO();
    const prompt = promptResumeMenu({ response_id: 'resp-1' }, { input, output });
    process.nextTick(() => input.emit('keypress', '3', { name: '3' }));
    await expect(prompt).resolves.toBe('auto-resume');
    expect(input.setRawMode).toHaveBeenCalledWith(true);
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(output.write).toHaveBeenCalled();
  });

  test('moves with arrow keys and confirms with enter', async () => {
    const { input, output } = makeIO();
    const prompt = promptResumeMenu({ response_id: 'resp-2' }, { input, output });
    process.nextTick(() => {
      input.emit('keypress', '', { name: 'down' });
      input.emit('keypress', '', { name: 'down' });
      input.emit('keypress', '', { name: 'return' });
    });
    await expect(prompt).resolves.toBe('auto-resume');
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('\x1b[6A\r\x1b[0J'))).toBe(true);
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('Fully auto-resume pending tool execution'))).toBe(true);
  });

  test('moves up with arrow keys and wraps to the last option', async () => {
    const { input, output } = makeIO();
    const prompt = promptResumeMenu({ response_id: 'resp-3' }, { input, output });
    process.nextTick(() => {
      input.emit('keypress', '', { name: 'up' });
      input.emit('keypress', '', { name: 'enter' });
    });
    await expect(prompt).resolves.toBe('new-session');
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('> 4. Start a new session'))).toBe(true);
  });

  test('rejects with AbortError on ctrl-c and restores terminal state', async () => {
    const { input, output } = makeIO();
    const prompt = promptResumeMenu({ response_id: 'resp-4' }, { input, output });
    process.nextTick(() => input.emit('keypress', '', { name: 'c', ctrl: true }));
    await expect(prompt).rejects.toMatchObject({ name: 'AbortError', message: 'Interrupted' });
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(output.write.mock.calls.some(([chunk]) => String(chunk).includes('[?25h'))).toBe(true);
  });
});
