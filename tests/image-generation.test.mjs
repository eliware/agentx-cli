import { describe, expect, test } from '@jest/globals';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveGeneratedImage } from '../src/image-generation.mjs';

describe('image generation output', () => {
  test('saves base64 result as a PNG', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agentx-generated-'));
    try {
      const filePath = await saveGeneratedImage({ result: Buffer.from('png-data').toString('base64') }, { directory, now: 123, random: () => 0.5 });
      await expect(readFile(filePath, 'utf8')).resolves.toBe('png-data');
      expect(filePath).toBe(join(directory, 'generated-123-500000000.png'));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('rejects missing or invalid results', async () => {
    await expect(saveGeneratedImage({})).rejects.toThrow('no image data');
    await expect(saveGeneratedImage({ result: '!!!' })).rejects.toThrow('invalid image data');
  });
});
