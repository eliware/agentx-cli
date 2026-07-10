import { describe, expect, test, jest } from '@jest/globals';
import { fs as commonFs } from '@eliware/common';
import { deleteOptional, isDirectInvocation, readJson, readOptionalText, writeText } from '../src/runtime.mjs';
import { mkdtempSync, symlinkSync, rmSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('runtime helpers', () => {
  test('isDirectInvocation returns a boolean', () => {
    expect(typeof isDirectInvocation()).toBe('boolean');
  });

  test('isDirectInvocation resolves symlinks to the real launcher', () => {
    if (process.platform === 'win32') return;
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'agentx-link-'));
    const link = path.join(tmp, 'agentx');
    const moduleUrl = new URL('../agentx.mjs', import.meta.url).href;
    symlinkSync(new URL(moduleUrl), link);
    const originalArgv1 = process.argv[1];

    try {
      process.argv[1] = link;
      expect(isDirectInvocation(moduleUrl)).toBe(true);
    } finally {
      process.argv[1] = originalArgv1;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('isDirectInvocation returns false for missing launcher paths', () => {
    const originalArgv1 = process.argv[1];

    try {
      process.argv[1] = undefined;
      expect(isDirectInvocation()).toBe(false);
      process.argv[1] = '/tmp/definitely-not-real-agentx';
      expect(isDirectInvocation(new URL('../agentx.mjs', import.meta.url).href)).toBe(false);
    } finally {
      process.argv[1] = originalArgv1;
    }
  });



  test('readOptionalText and deleteOptional propagate mocked non-ENOENT errors', async () => {
    jest.resetModules();
    await jest.unstable_mockModule('@eliware/common', () => ({
      fs: {
        promises: {
          readFile: async () => { throw Object.assign(new Error('boom'), { code: 'EACCES' }); },
          unlink: async () => { throw Object.assign(new Error('boom'), { code: 'EACCES' }); },
          writeFile: async () => {},
        },
      },
      path: () => '',
    }));
    const { readOptionalText: readOptionalTextMock, deleteOptional: deleteOptionalMock } = await import('../src/runtime.mjs');
    await expect(readOptionalTextMock('/tmp/locked')).rejects.toThrow('boom');
    await expect(deleteOptionalMock('/tmp/locked')).rejects.toThrow('boom');
  });



  test('readOptionalText and deleteOptional tolerate ENOENT errors', async () => {
    const originalReadFile = commonFs.promises.readFile;
    const originalUnlink = commonFs.promises.unlink;
    commonFs.promises.readFile = async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };
    commonFs.promises.unlink = async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };
    try {
      await expect(readOptionalText('/tmp/definitely-missing-agentx')).resolves.toBeNull();
      await expect(deleteOptional('/tmp/definitely-missing-agentx')).resolves.toBeUndefined();
    } finally {
      commonFs.promises.readFile = originalReadFile;
      commonFs.promises.unlink = originalUnlink;
    }
  });

  test('readOptionalText propagates non-ENOENT errors', async () => {
    const originalReadFile = commonFs.promises.readFile;
    commonFs.promises.readFile = async () => { throw Object.assign(new Error('boom'), { code: 'EACCES' }); };
    try {
      await expect(readOptionalText('/tmp/locked')).rejects.toThrow('boom');
    } finally {
      commonFs.promises.readFile = originalReadFile;
    }
  });

  test('readJson, readOptionalText and deleteOptional handle success and failure cases', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'agentx-runtime-'));
    const jsonFile = path.join(tmp, 'value.json');
    const textFile = path.join(tmp, 'value.txt');
    await writeText(jsonFile, JSON.stringify({ ok: true }));
    await writeText(textFile, 'hello');

    expect(await readJson(jsonFile)).toEqual({ ok: true });
    expect(await readOptionalText(textFile)).toBe('hello');
    await deleteOptional(textFile);
    expect(() => unlinkSync(textFile)).toThrow();

    const originalUnlink = commonFs.promises.unlink;
    commonFs.promises.unlink = async () => { throw Object.assign(new Error('boom'), { code: 'EACCES' }); };
    try {
      await expect(deleteOptional(textFile)).rejects.toThrow('boom');
    } finally {
      commonFs.promises.unlink = originalUnlink;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
