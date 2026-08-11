import { describe, expect, jest, test } from '@jest/globals';
import { recreateOpenAIClient, waitForWebsocketRetry, websocketRecoveryDelay, WEBSOCKET_RECOVERY_WINDOW_MS } from '../src/retry-recovery.mjs';

describe('retry recovery', () => {
  test('uses capped exponential websocket retry delays', () => {
    expect(websocketRecoveryDelay(0)).toBe(250);
    expect(websocketRecoveryDelay(1)).toBe(500);
    expect(websocketRecoveryDelay(2)).toBe(1000);
    expect(websocketRecoveryDelay(3)).toBe(2000);
    expect(websocketRecoveryDelay(8)).toBe(2000);
  });

  test('waits within the ten-second websocket recovery window', async () => {
    const sleep = jest.fn(async () => {});
    await expect(waitForWebsocketRetry(1000, 0, 1000, sleep)).resolves.toBe(true);
    expect(sleep).toHaveBeenCalledWith(250);
    await expect(waitForWebsocketRetry(1000, 4, 9000, sleep)).resolves.toBe(false);
    expect(sleep).toHaveBeenCalledTimes(1);
    await expect(waitForWebsocketRetry(1000, 0, 1000 + WEBSOCKET_RECOVERY_WINDOW_MS - 251, sleep)).resolves.toBe(true);
  });

  test('uses the default timer when no sleep function is supplied', async () => {
    await expect(waitForWebsocketRetry(Date.now(), 0)).resolves.toBe(true);
  });

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
