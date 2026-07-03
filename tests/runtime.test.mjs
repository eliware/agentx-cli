import { describe, expect, test } from '@jest/globals';
import { isDirectInvocation, requestIdPath } from '../src/runtime.mjs';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('runtime helpers', () => {
  test('requestIdPath targets the cwd marker file', () => {
    expect(requestIdPath('/tmp/work')).toBe('/tmp/work/.agentx_responseid');
  });

  test('isDirectInvocation returns a boolean', () => {
    expect(typeof isDirectInvocation()).toBe('boolean');
  });

  test('isDirectInvocation resolves symlinks to the real launcher', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'agentx-link-'));
    const link = path.join(tmp, 'agentx');
    symlinkSync('/opt/agentx/agentx.mjs', link);
    const originalArgv1 = process.argv[1];

    try {
      process.argv[1] = link;
      expect(isDirectInvocation(new URL('file:///opt/agentx/agentx.mjs').href)).toBe(true);
    } finally {
      process.argv[1] = originalArgv1;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
