import { describe, expect, test } from '@jest/globals';
import { completePath } from '../src/completion.mjs';
import { cleanupTempDir, makeDirectory, makeFile, makeTempDir } from './test-helpers.mjs';

describe('completion', () => {
  test('completePath suggests files and folders from cwd', async () => {
    const tmp = makeTempDir('agentx-complete-');
    try {
      makeDirectory(tmp, 'folder');
      makeFile(tmp, 'file.txt');

      const [matches] = await completePath('cd f', tmp);
      expect(matches).toContain('file.txt');
      expect(matches).toContain('folder/');
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('completePath sorts matches and quotes entries with spaces', async () => {
    const tmp = makeTempDir('agentx-complete-');
    try {
      makeFile(tmp, 'z-last.txt');
      makeFile(tmp, 'a first.txt');

      const [matches] = await completePath('', tmp);
      expect(matches[0]).toBe('"a first.txt"');
      expect(matches[1]).toBe('z-last.txt');
    } finally {
      cleanupTempDir(tmp);
    }
  });


  test('completePath preserves absolute directory prefixes', async () => {
    const tmp = makeTempDir('agentx-complete-');
    try {
      makeDirectory(tmp, 'opt');
      makeFile(tmp, 'opt/agentx');
      const [matches] = await completePath('/opt/agen', tmp);
      expect(matches).toContain('/opt/agentx-cli/');
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('completePath normalizes accidental double-slash completions', async () => {
    const tmp = makeTempDir('agentx-complete-');
    try {
      makeDirectory(tmp, 'opt');
      const [matches, token] = await completePath('/op', tmp);
      expect(token).toBe('/op');
      expect(matches).not.toContain('//opt/');
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('completePath handles nested and hidden paths', async () => {
    const tmp = makeTempDir('agentx-complete-');
    try {
      makeDirectory(tmp, 'src/nested');
      makeFile(tmp, '.env.local');
      const [nested] = await completePath('cd src/n', tmp);
      expect(nested).toContain('src/nested/');
      const [hidden] = await completePath('.', tmp);
      expect(hidden).toContain('.env.local');
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
