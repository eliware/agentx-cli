import { describe, expect, jest, test } from '@jest/globals';

describe('agentx-setup entrypoint', () => {
  test('does not start setup when imported indirectly', async () => {
    const runSetup = jest.fn();
    await jest.unstable_mockModule('../src/setup.mjs', () => ({ runSetup }));

    await import('../agentx-setup.mjs');

    expect(runSetup).not.toHaveBeenCalled();
  });
});
