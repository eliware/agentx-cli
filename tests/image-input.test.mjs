import { describe, expect, jest, test } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { assertReadableImage, defaultConvertToJpeg, encodeImageInput, resolveImagePath } from '../src/image-input.mjs';

describe('image input encoding', () => {
  let dir;
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'agentx-image-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  test('resolves paths relative to cwd and rejects missing paths', () => {
    expect(resolveImagePath('images/picture.png', '/work')).toBe(resolve('/work', 'images', 'picture.png'));
    expect(resolveImagePath('picture.png')).toBe(join(process.cwd(), 'picture.png'));
    expect(() => resolveImagePath(undefined)).toThrow('Image path is required');
  });

  test('converts and returns an inline JPEG data URL', async () => {
    await writeFile(join(dir, 'picture.png'), 'source');
    const convert = jest.fn(async (input, options) => {
      expect(input.toString()).toBe('source');
      expect(options.path).toBe(join(dir, 'picture.png'));
      return jpeg;
    });
    const result = await encodeImageInput('picture.png', { cwd: dir, detail: 'high', convertToJpeg: convert });
    expect(result).toMatchObject({ path: join(dir, 'picture.png'), detail: 'high', mimeType: 'image/jpeg', bytes: jpeg.length });
    expect(result.dataUrl).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
    expect(convert).toHaveBeenCalled();
  });

  test('rejects invalid detail and unreadable or non-file paths', async () => {
    await expect(encodeImageInput('missing.png', { cwd: dir, convertToJpeg: jest.fn() })).rejects.toThrow('Unable to read image file');
    await expect(encodeImageInput('.', { cwd: dir, convertToJpeg: jest.fn() })).rejects.toThrow('not a regular file');
    await expect(encodeImageInput('', { cwd: dir, convertToJpeg: jest.fn() })).rejects.toThrow('Image path is required');
    await expect(encodeImageInput('missing.png', { cwd: dir, detail: 'medium', convertToJpeg: jest.fn() })).rejects.toThrow('Invalid image detail');
  });

  test('accepts non-Buffer converted data', async () => {
    await writeFile(join(dir, 'picture.png'), 'source');
    const result = await encodeImageInput('picture.png', { cwd: dir, convertToJpeg: async () => new Uint8Array([1, 2, 3]) });
    expect(result.bytes).toBe(3);
    expect(result.dataUrl).toBe('data:image/jpeg;base64,AQID');
  });

  test('reports unavailable image conversion', async () => {
    await expect(defaultConvertToJpeg(Buffer.from('source'), undefined, async () => { throw new Error('missing'); })).rejects.toThrow('optional sharp package');
    await writeFile(join(dir, 'picture.png'), 'source');
    await assertReadableImage(join(dir, 'picture.png'));
  });

  test('uses sharp for default conversion', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    await writeFile(join(dir, 'picture.png'), png);
    const result = await encodeImageInput(join(dir, 'picture.png'));
    expect(result.detail).toBe('low');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  test('rejects oversized source and converted data', async () => {
    await writeFile(join(dir, 'large.png'), '12345');
    await expect(encodeImageInput('large.png', { cwd: dir, maxBytes: 4, convertToJpeg: jest.fn() })).rejects.toThrow('exceeds');
    await expect(encodeImageInput('large.png', { cwd: dir, convertToJpeg: async () => Buffer.alloc(6), maxBytes: 5 })).rejects.toThrow('Converted image exceeds');
  });
});
