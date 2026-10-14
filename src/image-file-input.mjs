import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export const MAX_IMAGE_FILE_BYTES = 50 * 1024 * 1024;

export function resolveImagePath(filePath, cwd = process.cwd()) {
  const value = String(filePath ?? "").trim();
  if (!value) throw new Error("Image path is required.");
  return path.resolve(cwd, value);
}

export async function assertReadableImage(filePath, maxBytes = MAX_IMAGE_FILE_BYTES) {
  let info;
  try {
    info = await stat(filePath);
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`Unable to read image file: ${filePath}`);
  }
  if (!info.isFile()) throw new Error(`Image path is not a regular file: ${filePath}`);
  if (info.size > maxBytes) throw new Error(`Image file exceeds the ${maxBytes} byte limit.`);
  return readFile(filePath);
}
