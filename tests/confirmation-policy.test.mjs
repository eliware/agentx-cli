import { describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { confirmationFilePath, confirmationKey, loadGlobalConfirmations, saveGlobalConfirmations } from '../src/confirmation-policy.mjs';

describe('confirmation policy', () => {
  test('builds keys and resolves home config path', () => {
    const call = { type: 'shell_call', action: { commands: ['npm   install foo'] } };
    expect(confirmationKey(call, '/tmp/work')).toBe(JSON.stringify({ type: 'shell_call', cwd: '/tmp/work', commands: ['npm install foo'] }));
    expect(confirmationFilePath({ HOME: '/home/test' })).toBe(path.join('/home/test', '.agentx-confirmations.json'));
    expect(confirmationFilePath({})).toBe('');
    const originalHome = process.env.HOME;
    process.env.HOME = '/tmp/agentx-confirm-home';
    try {
      expect(confirmationFilePath()).toBe(path.join('/tmp/agentx-confirm-home', '.agentx-confirmations.json'));
      expect(confirmationKey({ type: 'shell_call', action: { commands: [null, '   ', ' echo   ok '] } })).toBe(JSON.stringify({ type: 'shell_call', cwd: '', commands: ['echo ok'] }));
      expect(confirmationKey({ type: 'shell_call', action: { commands: 'npm   test' } })).toBe(JSON.stringify({ type: 'shell_call', cwd: '', commands: ['npm test'] }));
      expect(confirmationKey(null)).toBe(JSON.stringify({ type: '', cwd: '', commands: [] }));
    } finally {
      if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome;
    }
  });

  test('loads missing or malformed config and saves approvals', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'agentx-confirm-'));
    const file = path.join(dir, 'confirmations.json');
    try {
      await expect(loadGlobalConfirmations(file)).resolves.toEqual(new Set());
      await expect(loadGlobalConfirmations('')).resolves.toEqual(new Set());
      const originalHomeForLoad = process.env.HOME;
      process.env.HOME = path.join(dir, 'empty-home');
      try { await expect(loadGlobalConfirmations()).resolves.toEqual(new Set()); } finally {
        if (originalHomeForLoad === undefined) delete process.env.HOME; else process.env.HOME = originalHomeForLoad;
      }
      await readFile(file, 'utf8').catch(() => undefined);
      await import('node:fs/promises').then(({ writeFile }) => writeFile(file, '{bad'));
      await expect(loadGlobalConfirmations(file)).resolves.toEqual(new Set());
      await import('node:fs/promises').then(({ writeFile }) => writeFile(file, JSON.stringify({ value: true })));
      await expect(loadGlobalConfirmations(file)).resolves.toEqual(new Set());
      await saveGlobalConfirmations(new Set(['b', 'a']), file);
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(['a', 'b']);
      await expect(loadGlobalConfirmations(file)).resolves.toEqual(new Set(['a', 'b']));
      await expect(loadGlobalConfirmations(dir)).rejects.toBeTruthy();
      await saveGlobalConfirmations(new Set(), '');
      const originalHome = process.env.HOME;
      process.env.HOME = dir;
      try {
        await saveGlobalConfirmations(new Set(['default']));
        await expect(loadGlobalConfirmations(path.join(dir, '.agentx-confirmations.json'))).resolves.toEqual(new Set(['default']));
      } finally {
        if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome;
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
