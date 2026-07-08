import { describe, expect, test } from '@jest/globals';
import path from 'node:path';
import { completePath, tokenPrefix } from '../src/path-completion.mjs';
import { cleanupTempDir, makeDirectory, makeFile, makeTempDir } from './test-helpers.mjs';

describe('path completion', () => {
  const sep = process.platform === 'win32' ? '\\' : '/';
  test('suggests files and folders from cwd', async () => {
    const tmp = makeTempDir('agentx-complete-');
    try {
      makeDirectory(tmp, 'folder');
      makeFile(tmp, 'file.txt');

      const [matches] = await completePath('cd f', tmp);
      expect(matches).toContain('file.txt');
      expect(matches).toContain(`folder${sep}`);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('parses Windows-style prefixes without listing the filesystem', () => {
    const win = tokenPrefix('C:\\Users\\alice\\Doc', 'win32');
    expect(win.baseDir).toBe('C:\\Users\\alice');
    expect(win.prefix).toBe('C:\\Users\\alice\\');
    expect(win.needle).toBe('Doc');
  });

  test('covers trailing-slash and rooted prefix branches', () => {
    expect(tokenPrefix('foo/', 'linux')).toEqual({ baseDir: '.', prefix: '', needle: 'foo' });
    expect(tokenPrefix('/foo', 'linux')).toEqual({ baseDir: '/', prefix: '/', needle: 'foo' });
    expect(tokenPrefix('C:\\foo', 'win32')).toEqual({ baseDir: 'C:\\', prefix: 'C:\\', needle: 'foo' });
  });

  test('sorts matches and quotes entries with spaces', async () => {
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

  test('preserves absolute directory prefixes and normalizes accidental double slashes', async () => {
    if (process.platform === 'win32') return;
    const tmp = makeTempDir('agentx-complete-');
    try {
      makeDirectory(tmp, 'opt');
      makeFile(tmp, 'opt/agentx');
      const [matches, token] = await completePath('/op', tmp);
      expect(token).toBe('/op');
      expect(matches).not.toContain(`//opt${sep}`);
      expect(matches).toContain('/opt/');
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('handles plain tokens, nested directories and missing directories', async () => {
    const tmp = makeTempDir('agentx-complete-');
    try {
      makeDirectory(tmp, 'plain/subdir');
      makeFile(tmp, 'plain-file.txt');
      const [plainTokenMatches, plainToken] = await completePath('cd p', tmp);
      expect(plainToken).toBe('p');
      expect(plainTokenMatches).toContain('plain-file.txt');
      const [plain] = await completePath('plain', tmp);
      expect(plain).toContain('plain-file.txt');
      const [nested] = await completePath('plain/s', tmp);
      expect(nested).toContain(`plain${sep}subdir${sep}`);
      const [missing] = await completePath('missing', `${tmp}/does-not-exist`);
      expect(missing).toEqual([]);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('returns no matches when the directory cannot be listed', async () => {
    const [matches, token] = await completePath('missing', '/definitely/not-real-agentx');
    expect(token).toBe('missing');
    expect(matches).toEqual([]);
  });

  test('preserves non-root absolute prefixes', async () => {
    if (process.platform === 'win32') return;
    const tmp = makeTempDir('agentx-complete-');
    try {
      const base = path.basename(tmp);
      const [matches] = await completePath(`/tmp/${base}`, tmp);
      expect(matches).toContain(`/tmp/${base}/`);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('preserves absolute prefixes inside /tmp', async () => {
    if (process.platform === 'win32') return;
    const tmp = makeTempDir('agentx-complete-');
    try {
      const base = path.basename(tmp);
      const [matches] = await completePath(`/tmp/${base.slice(0, 5)}`, tmp);
      expect(matches.some((entry) => entry.startsWith('/tmp/'))).toBe(true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('normalizes doubled leading slashes in the active token', async () => {
    const tmp = makeTempDir('agentx-complete-');
    try {
      const [matches, token] = await completePath('//op', tmp);
      expect(token).toBe('/op');
      expect(matches).not.toContain(`//opt${sep}`);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('handles nested, trailing-slash and hidden paths', async () => {
    const tmp = makeTempDir('agentx-complete-');
    try {
      makeDirectory(tmp, 'foo');
      makeDirectory(tmp, 'src/nested');
      makeFile(tmp, '.env.local');
      const [nested] = await completePath('cd src/n', tmp);
      expect(nested).toContain(`src${sep}nested${sep}`);
      const [trailingSlash] = await completePath('foo/', tmp);
      expect(trailingSlash).toContain(`foo${sep}`);
      const [hidden] = await completePath('.', tmp);
      expect(hidden).toContain('.env.local');
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
