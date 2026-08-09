import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function saveGeneratedImage(item, { directory = path.join(tmpdir(), 'agentx-images'), now = Date.now(), random = Math.random } = {}) {
  const encoded = String(item?.result ?? '').trim();
  if (!encoded) throw new Error('image generation returned no image data');
  const data = Buffer.from(encoded, 'base64');
  if (!data.length) throw new Error('image generation returned invalid image data');
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `generated-${now}-${Math.floor(random() * 1e9)}.png`);
  await writeFile(filePath, data);
  return filePath;
}
