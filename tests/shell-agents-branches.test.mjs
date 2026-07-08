import { describe, expect, test, jest } from '@jest/globals';

describe('shell agents branch coverage', () => {
  test('hits ENOENT handling through a mocked module import', async () => {
    await jest.isolateModulesAsync(async () => {
      await jest.unstable_mockModule('@eliware/common', () => ({
        fs: {
          promises: {
            readFile: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
            lstat: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
            realpath: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
          },
        },
      }));
      const { readAgentsFromCwdAndParents } = await import('../src/shell-agents.mjs');
      await expect(readAgentsFromCwdAndParents('/does/not/matter')).resolves.toBe('');
    });
  });
});
