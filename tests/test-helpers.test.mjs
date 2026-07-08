import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { cleanupTempDir, makeDirectory, makeFile, makeTempDir } from './test-helpers.mjs';

describe('test helpers', () => {
  test('uses default arguments', () => {
    const tmp = makeTempDir();
    try {
      const filePath = makeFile(tmp, 'nested/file.txt');
      makeDirectory(tmp, 'nested/dir');

      expect(tmp).toMatch(/agentx-/);
      expect(filePath).toBe(`${tmp}/nested/file.txt`);
      expect(readFileSync(filePath, 'utf8')).toBe('x');
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
