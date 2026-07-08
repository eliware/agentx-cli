import { describe, expect, test } from '@jest/globals';
import path from 'node:path';
import {
  getHomeDirectory,
  getPathModule,
  getPromptIdentity,
  getShellLaunchers,
  isMissingLauncherError,
  isWindowsPlatform,
  normalizeDisplayPath,
  resolveUserPath,
} from '../src/platform.mjs';

describe('platform helpers', () => {
  test('detects windows and selects the matching path module', () => {
    expect(isWindowsPlatform('win32')).toBe(true);
    expect(isWindowsPlatform('linux')).toBe(false);
    expect(getPathModule('win32')).toBe(path.win32);
    expect(getPathModule('linux')).toBe(path.posix);
  });

  test('resolves home directories across platforms', () => {
    expect(getHomeDirectory()).toBe(String(process.env.HOME || process.env.USERPROFILE || ''));
    expect(getHomeDirectory({ USERPROFILE: 'C:\\Users\\alice' }, 'win32')).toBe('C:\\Users\\alice');
    expect(getHomeDirectory({ HOMEDRIVE: 'C:', HOMEPATH: '\\Users\\alice' }, 'win32')).toBe('C:\\Users\\alice');
    expect(getHomeDirectory({ HOMEDRIVE: 'C:' }, 'win32')).toBe('C:');
    expect(getHomeDirectory({ HOMEPATH: '\\Users\\alice' }, 'win32')).toBe('\\Users\\alice');
    expect(getHomeDirectory({ HOME: '/home/alice' }, 'linux')).toBe('/home/alice');
    expect(getHomeDirectory({ USERPROFILE: 'C:\\Users\\alice' }, 'linux')).toBe('C:\\Users\\alice');
  });

  test('uses default platform and identity fallbacks when omitted', () => {
    expect(isWindowsPlatform()).toBe(false);
    expect(getPathModule()).toBe(path.posix);
    expect(getPromptIdentity()).toEqual({ user: 'root', host: String(process.env.HOSTNAME || process.env.COMPUTERNAME || 'dev') });
    expect(normalizeDisplayPath()).toBe('.');
  });

  test('builds prompt identity with fallbacks', () => {
    expect(getPromptIdentity({ USER: 'alice', HOSTNAME: 'box' })).toEqual({ user: 'alice', host: 'box' });
    expect(getPromptIdentity({ USERNAME: 'bob', COMPUTERNAME: 'laptop' })).toEqual({ user: 'bob', host: 'laptop' });
    expect(getPromptIdentity({})).toEqual({ user: 'root', host: 'dev' });
  });

  test('returns the expected shell launchers', () => {
    expect(getShellLaunchers()).toEqual([{ file: '/bin/sh', args: ['-lc'] }]);
    expect(getShellLaunchers('linux')).toEqual([{ file: '/bin/sh', args: ['-lc'] }]);
    expect(getShellLaunchers('win32')).toEqual([
      { file: 'pwsh', args: ['-NoLogo', '-NoProfile', '-Command'] },
      { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-Command'] },
      { file: 'cmd.exe', args: ['/d', '/s', '/c'] },
    ]);
  });

  test('identifies missing launcher errors', () => {
    expect(isMissingLauncherError({ code: 'ENOENT' })).toBe(true);
    expect(isMissingLauncherError({ code: 'EACCES' })).toBe(false);
    expect(isMissingLauncherError(null)).toBe(false);
  });

  test('resolves user paths with home, cwd and tilde expansion', () => {
    expect(resolveUserPath('', '/work')).toBe(String(process.env.HOME || process.env.USERPROFILE || '/work'));
    expect(resolveUserPath('', '', { env: {}, platform: 'linux' })).toBe(process.cwd());
    expect(resolveUserPath('~', '', { env: {}, platform: 'linux' })).toBe(process.cwd());
    expect(resolveUserPath('notes', '/work')).toBe('/work/notes');
    expect(resolveUserPath('', '/work', { env: { HOME: '/home/alice' }, platform: 'linux' })).toBe('/home/alice');
    expect(resolveUserPath('~/notes', '/work', { env: { HOME: '/home/alice' }, platform: 'linux' })).toBe('/home/alice/notes');
    expect(resolveUserPath('/abs/path', '/work', { env: { HOME: '/home/alice' }, platform: 'linux' })).toBe('/abs/path');
    expect(resolveUserPath('', 'C:\\work', { env: { USERPROFILE: 'C:\\Users\\alice' }, platform: 'win32' })).toBe('C:\\Users\\alice');
    expect(resolveUserPath('docs', 'C:\\work', { env: { USERPROFILE: 'C:\\Users\\alice' }, platform: 'win32' })).toBe('C:\\work\\docs');
    expect(resolveUserPath('~\\docs', 'C:\\work', { env: { USERPROFILE: 'C:\\Users\\alice' }, platform: 'win32' })).toBe('C:\\Users\\alice\\docs');
    expect(resolveUserPath('C:\\Temp', 'C:\\work', { env: {}, platform: 'win32' })).toBe('C:\\Temp');
  });

  test('normalizes display paths on both platforms', () => {
    expect(normalizeDisplayPath('/tmp//work/./a', 'linux')).toBe('/tmp/work/a');
    expect(normalizeDisplayPath('C:\\temp\\..\\work\\.', 'win32')).toBe('C:\\work');
    expect(normalizeDisplayPath(undefined, 'linux')).toBe('.');
  });
});
