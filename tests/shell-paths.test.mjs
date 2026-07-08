import { describe, expect, test } from '@jest/globals';
import path from 'node:path';
import { buildWorkingDirectoryNote, resolveCdTarget } from '../src/shell-paths.mjs';
import { getHomeDirectory, resolveUserPath } from '../src/platform.mjs';
import { cleanupTempDir, makeDirectory, makeFile, makeTempDir } from './test-helpers.mjs';

describe('shell paths', () => {
  test('describes cwd changes', () => {
    expect(buildWorkingDirectoryNote('/tmp/work')).toBe('User changed working directory to /tmp/work');
  });

  test('falls back to the cwd when HOME is missing', async () => {
    const tmp = makeTempDir('agentx-shell-');
    try {
      expect(await resolveCdTarget('', tmp, { env: {} })).toBe(tmp);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('falls back to cwd when HOME is missing and target is home-based', async () => {
    const tmp = makeTempDir('agentx-shell-');
    try {
      const expected = `${tmp}/sub`;
      makeDirectory(tmp, 'sub');
      expect(await resolveCdTarget('~', tmp, { env: {} })).toBe(tmp);
      expect(await resolveCdTarget('~', tmp, { env: { HOME: expected, USERPROFILE: expected } })).toBe(expected);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('uses HOME when cd target is tilde-based and preserves not-a-directory errors', async () => {
    const tmp = makeTempDir('agentx-shell-');
    try {
      makeDirectory(tmp, 'home-dir/child');
      const env = { HOME: `${tmp}/home-dir`, USERPROFILE: `${tmp}/home-dir` };
      expect(await resolveCdTarget('~', tmp, { env })).toBe(`${tmp}/home-dir`);
      expect(await resolveCdTarget('~/child', tmp, { env })).toBe(`${tmp}/home-dir/child`);
      makeFile(tmp, 'notdir');
      await expect(resolveCdTarget('notdir', tmp)).rejects.toThrow(/not a directory/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('resolves Windows-style home and drive paths', () => {
    expect(getHomeDirectory({ USERPROFILE: 'C:\\Users\\alice' }, 'win32')).toBe('C:\\Users\\alice');
    expect(getHomeDirectory({ HOMEDRIVE: 'C:', HOMEPATH: '\\Users\\alice' }, 'win32')).toBe('C:\\Users\\alice');
    expect(resolveUserPath('~\\docs', 'C:\\work', { platform: 'win32', env: { USERPROFILE: 'C:\\Users\\alice' } })).toBe('C:\\Users\\alice\\docs');
    expect(resolveUserPath('C:\\Temp', 'C:\\work', { platform: 'win32', env: {} })).toBe('C:\\Temp');
  });

  test('uses HOME in the error path when the target is empty', async () => {
    const tmp = makeTempDir('agentx-shell-');
    try {
      makeFile(tmp, 'home-file');
      const env = { HOME: `${tmp}/home-file`, USERPROFILE: `${tmp}/home-file` };
      await expect(resolveCdTarget('', tmp, { env })).rejects.toThrow(/not a directory: .*home-file/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('accepts relative, absolute and home-based directories', async () => {
    const tmp = makeTempDir('agentx-shell-');
    try {
      makeDirectory(tmp, 'sub');
      expect(await resolveCdTarget('sub', tmp)).toBe(path.join(tmp, 'sub'));
      expect(await resolveCdTarget(path.join(tmp, 'sub'), tmp)).toBe(path.join(tmp, 'sub'));

      const env = { HOME: `${tmp}/sub`, USERPROFILE: `${tmp}/sub` };
      expect(await resolveCdTarget('', tmp, { env })).toBe(`${tmp}/sub`);
      expect(await resolveCdTarget('~', tmp, { env })).toBe(`${tmp}/sub`);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('rejects non-directories', async () => {
    const tmp = makeTempDir('agentx-shell-');
    try {
      makeFile(tmp, 'file.txt');
      await expect(resolveCdTarget('file.txt', tmp)).rejects.toThrow(/not a directory/);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
