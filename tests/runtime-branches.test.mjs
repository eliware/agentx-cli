import { describe, expect, test, jest } from '@jest/globals';

describe('runtime branch coverage', () => {
  test('hits ENOENT handling through a mocked module import', async () => {
    await jest.isolateModulesAsync(async () => {
      await jest.unstable_mockModule('@eliware/common', () => ({
        fs: {
          promises: {
            readFile: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
            unlink: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
            writeFile: async () => {},
          },
        },
        path: () => '',
      }));
      const { readOptionalText, deleteOptional } = await import('../src/runtime.mjs');
      await expect(readOptionalText('/tmp/anything')).resolves.toBeNull();
      await expect(deleteOptional('/tmp/anything')).resolves.toBeUndefined();
    });
  });
});
