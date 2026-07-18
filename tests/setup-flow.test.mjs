import { describe, expect, test } from '@jest/globals';
import { setupInternals } from '../src/setup.mjs';

describe('setup flow cleanup', () => {
  test('does not expose web-server settings or service actions', () => {
    const entries = setupInternals.buildMenuEntries({ values: { AGENTX_API_KEY: 'set' } });
    expect(entries.map((entry) => entry.id)).toEqual(['api', 'quit']);
    expect(JSON.stringify(entries)).not.toMatch(/HOST|PORT|service|gui/i);
  });
});
