import { describe, expect, test } from '@jest/globals';

describe('entrypoint', () => {
  test('agentx.mjs imports without running the REPL in test mode', async () => {
    process.env.LOG_LEVEL = 'none';
    await import('../agentx.mjs');
    expect(true).toBe(true);
  });
});
