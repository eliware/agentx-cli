import { describe, expect, test, jest } from '@jest/globals';

// This test ensures that a failure to resolve the real path of an AGENTS.md file
// correctly results in a `null` entry. The previous branch test only exercised
// the ENOENT case during the initial readFile/lstat call, so line 18 (the
// `return null;` after a realpath error) remained uncovered.

describe('shell agents realpath error handling', () => {
  test('returns null when fs.realpath throws an error', async () => {
    await jest.isolateModulesAsync(async () => {
      // Mock file system operations: readFile succeeds, lstat returns a simple
      // stats object, but realpath throws.
      await jest.unstable_mockModule('@eliware/common', () => ({
        fs: {
          promises: {
            readFile: async () => 'content',
            lstat: async () => ({ isSymbolicLink: () => false }),
            realpath: async () => {
              throw new Error('realpath failure');
            },
          },
        },
      }));

      // Ensure no home directory entry interferes.
      await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => null }));

      const { readAgentsFromCwdAndParents } = await import('../src/shell-agents.mjs');
      // The cwd has an AGENTS.md that cannot be resolved; the function should
      // return an empty string.
      await expect(readAgentsFromCwdAndParents('/does/not/matter')).resolves.toBe('');
    });
  });
});
