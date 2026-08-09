import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const DEFAULT_DETAIL = 'low';
const DETAILS = new Set(['low', 'auto', 'high']);
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 4096;

function resolveImagePath(filePath, cwd = process.cwd()) {
  const value = String(filePath ?? '').trim();
  if (!value) throw new Error('Image path is required.');
  return path.resolve(cwd, value);
}

async function assertReadableImage(filePath, maxBytes = MAX_INPUT_BYTES) {
  let info;
  try {
    info = await stat(filePath);
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`Unable to read image file: ${filePath}`);
  }
  if (!info.isFile()) throw new Error(`Image path is not a regular file: ${filePath}`);
  if (info.size > maxBytes) throw new Error(`Image file exceeds the ${maxBytes} byte limit.`);
}

async function defaultConvertToJpeg(buffer, options, loadSharp = () => import('sharp')) {
  let sharp;
  try {
    ({ default: sharp } = await loadSharp());
  } catch {
    throw new Error('Image conversion requires the optional sharp package.');
  }
  return sharp(buffer)
    .rotate()
    .resize({ width: options.maxDimension, height: options.maxDimension, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: options.quality })
    .toBuffer();
}

export async function encodeImageInput(filePath, {
  cwd = process.cwd(),
  detail = DEFAULT_DETAIL,
  maxBytes = MAX_INPUT_BYTES,
  maxDimension = DEFAULT_MAX_DIMENSION,
  quality = 85,
  convertToJpeg = defaultConvertToJpeg,
} = {}) {
  if (!DETAILS.has(detail)) throw new Error(`Invalid image detail: ${detail}`);
  const resolvedPath = resolveImagePath(filePath, cwd);
  await assertReadableImage(resolvedPath, maxBytes);
  const source = await readFile(resolvedPath);
  const jpeg = await convertToJpeg(source, { maxDimension, quality, path: resolvedPath });
  const data = Buffer.isBuffer(jpeg) ? jpeg : Buffer.from(jpeg);
  if (data.length > maxBytes) throw new Error(`Converted image exceeds the ${maxBytes} byte limit.`);
  return {
    path: resolvedPath,
    detail,
    mimeType: 'image/jpeg',
    dataUrl: `data:image/jpeg;base64,${data.toString('base64')}`,
    bytes: data.length,
  };
}

export { DEFAULT_DETAIL, DEFAULT_MAX_DIMENSION, MAX_INPUT_BYTES, assertReadableImage, defaultConvertToJpeg, resolveImagePath };
