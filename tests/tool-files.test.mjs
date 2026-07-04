import { afterEach, describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileTool } from '../src/tool-files.mjs';
import { cleanupTempDir, makeTempDir } from './test-helpers.mjs';

describe('writeFileTool', () => {
  let tempDir;

  afterEach(() => {
    if (tempDir) cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  test('creates parent directories before writing', async () => {
    tempDir = makeTempDir('agentx-write-');
    const filePath = path.join(tempDir, 'nested', 'dir', 'note.txt');

    const result = await writeFileTool(filePath, 'hello');

    expect(result).toBe(`WROTE: ${filePath}`);
    expect(readFileSync(filePath, 'utf8')).toBe('hello');
  });
});
