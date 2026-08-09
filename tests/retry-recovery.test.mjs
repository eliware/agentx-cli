import { describe, expect, jest, test } from '@jest/globals';
import { recreateOpenAIClient } from '../src/retry-recovery.mjs';

describe('retry recovery', () => {
  test('closes the stale client before creating a replacement', async () => {
    const close = jest.fn(async () => {});
    const replacement = { responses: { close: jest.fn() } };
    const create = jest.fn(() => replacement);
    await expect(recreateOpenAIClient({ responses: { close } }, create)).resolves.toBe(replacement);
    expect(close).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('continues when stale-client cleanup fails', async () => {
    const replacement = { responses: {} };
    const create = jest.fn(() => replacement);
    await expect(recreateOpenAIClient({ responses: { close: jest.fn(async () => { throw new Error('closed'); }) } }, create)).resolves.toBe(replacement);
  });
});
