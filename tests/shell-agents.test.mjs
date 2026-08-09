import { describe, expect, test, jest } from '@jest/globals';
import { fs as commonFs } from '@eliware/common';
import { readAgentsFromCwdAndParents } from '../src/shell-agents.mjs';
import { cleanupTempDir, makeDirectory, makeFile, makeTempDir } from './test-helpers.mjs';

describe('shell agents', () => {
  test('readAgentsFromCwdAndParents hits the ENOENT branch via a mocked module', async () => {
    await jest.isolateModulesAsync(async () => {
      await jest.unstable_mockModule('@eliware/common', () => ({
        fs: {
          promises: {
            readFile: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
            lstat: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
            realpath: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
            writeFile: async () => {},
            symlink: async () => {},
          },
        },
      }));
      const { readAgentsFromCwdAndParents: readAgentsMock } = await import('../src/shell-agents.mjs');
      await expect(readAgentsMock('/does/not/matter')).resolves.toBe('');
    });
  });

  test('returns an empty string when AGENTS reads are missing', async () => {
    const originalReadFile = commonFs.promises.readFile;
    const originalLstat = commonFs.promises.lstat;
    const originalRealpath = commonFs.promises.realpath;
    const enoent = Object.assign(new Error('missing'), { code: 'ENOENT' });
    commonFs.promises.readFile = async () => { throw enoent; };
    commonFs.promises.lstat = async () => { throw enoent; };
    commonFs.promises.realpath = async () => { throw enoent; };
    try {
      await expect(readAgentsFromCwdAndParents('/does/not/matter')).resolves.toBe('');
    } finally {
      commonFs.promises.readFile = originalReadFile;
      commonFs.promises.lstat = originalLstat;
      commonFs.promises.realpath = originalRealpath;
    }
  });

  test('propagates non-ENOENT read errors', async () => {
    const originalReadFile = commonFs.promises.readFile;
    const originalLstat = commonFs.promises.lstat;
    const originalRealpath = commonFs.promises.realpath;
    const error = Object.assign(new Error('boom'), { code: 'EACCES' });
    commonFs.promises.readFile = async () => { throw error; };
    commonFs.promises.lstat = async () => { throw error; };
    commonFs.promises.realpath = async () => { throw error; };
    try {
      await expect(readAgentsFromCwdAndParents('/does/not/matter')).rejects.toThrow('boom');
    } finally {
      commonFs.promises.readFile = originalReadFile;
      commonFs.promises.lstat = originalLstat;
      commonFs.promises.realpath = originalRealpath;
    }
  });

  test('merges parent AGENTS files from least to most specific', async () => {
    const tmp = makeTempDir('agentx-');
    try {
      makeDirectory(tmp, 'parent/child');
      makeFile(tmp, 'AGENTS.md', 'root');
      makeFile(tmp, 'parent/AGENTS.md', 'parent');
      const text = await readAgentsFromCwdAndParents(`${tmp}/parent/child`);
      expect(text).toMatch(/root[\s\S]*parent/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('accepts a missing home directory', async () => {
    const tmp = makeTempDir('agentx-');
    try {
      await expect(readAgentsFromCwdAndParents(tmp, null)).resolves.toEqual(expect.any(String));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('prepends a distinct home AGENTS file', async () => {
    const tmp = makeTempDir('agentx-');
    const home = makeTempDir('agentx-home-');
    try {
      makeDirectory(tmp, 'child');
      makeFile(home, 'AGENTS.md', 'home');
      makeFile(tmp, 'AGENTS.md', 'cwd');
      const text = await readAgentsFromCwdAndParents(`${tmp}/child`, home);
      expect(text).toMatch(/home[\s\S]*cwd/);
    } finally {
      cleanupTempDir(tmp);
      cleanupTempDir(home);
    }
  });

  test('deduplicates symlinked AGENTS files by real path', async () => {
    if (process.platform === 'win32') return;
    const tmp = makeTempDir('agentx-');
    try {
      makeDirectory(tmp, 'docs');
      await commonFs.promises.writeFile(`${tmp}/docs/AGENTS.md`, 'docs');
      await commonFs.promises.symlink(`${tmp}/docs/AGENTS.md`, `${tmp}/AGENTS.md`);
      const text = await readAgentsFromCwdAndParents(tmp);
      expect(text).toContain(`# AGENTS.md (${tmp})`);
      expect(text).toContain('docs');
    } finally {
      cleanupTempDir(tmp);
    }
  });
});



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

test('skips entries when realpath resolution fails', async () => {
  const originalReadFile = commonFs.promises.readFile;
  const originalLstat = commonFs.promises.lstat;
  const originalRealpath = commonFs.promises.realpath;
  commonFs.promises.readFile = async () => 'content';
  commonFs.promises.lstat = async () => ({ isSymbolicLink: () => false });
  commonFs.promises.realpath = async () => { throw new Error('realpath failure'); };
  try { await expect(readAgentsFromCwdAndParents('/tmp/agentx-realpath-failure', '')).resolves.toBe(''); }
  finally { commonFs.promises.readFile = originalReadFile; commonFs.promises.lstat = originalLstat; commonFs.promises.realpath = originalRealpath; }
});
