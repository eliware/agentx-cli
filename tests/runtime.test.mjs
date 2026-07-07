import { describe, expect, test } from '@jest/globals';
import { deleteOptional, isDirectInvocation, readJson, readOptionalText, writeText } from '../src/runtime.mjs';
import { mkdtempSync, symlinkSync, rmSync, writeFileSync, unlinkSync, promises as fsPromises } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('runtime helpers', () => {
  test('isDirectInvocation returns a boolean', () => {
    expect(typeof isDirectInvocation()).toBe('boolean');
  });

  test('isDirectInvocation resolves symlinks to the real launcher', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'agentx-link-'));
    const link = path.join(tmp, 'agentx');
    symlinkSync('/opt/agentx-cli/agentx.mjs', link);
    const originalArgv1 = process.argv[1];

    try {
      process.argv[1] = link;
      expect(isDirectInvocation(new URL('file:///opt/agentx-cli/agentx.mjs').href)).toBe(true);
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
      expect(isDirectInvocation(new URL('file:///opt/agentx-cli/agentx.mjs').href)).toBe(false);
    } finally {
      process.argv[1] = originalArgv1;
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

    const originalUnlink = fsPromises.unlink;
    fsPromises.unlink = async () => { throw Object.assign(new Error('boom'), { code: 'EACCES' }); };
    try {
      await expect(deleteOptional(textFile)).rejects.toThrow('boom');
    } finally {
      fsPromises.unlink = originalUnlink;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
