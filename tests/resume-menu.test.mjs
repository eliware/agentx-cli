import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { promptResumeMenu } from '../src/resume-menu.mjs';

function makeIO() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.setRawMode = jest.fn();
  input.resume = jest.fn();
  const output = { write: jest.fn() };
  return { input, output };
}

describe('resume menu', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
});
