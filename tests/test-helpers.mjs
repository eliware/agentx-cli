import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function makeTempDir(prefix = 'agentx-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupTempDir(dir) {
  rmSync(dir, { recursive: true, force: true });
}

export function makeFile(dir, relativePath, content = 'x') {
  const filePath = path.join(dir, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

export function makeDirectory(dir, relativePath) {
  const fullPath = path.join(dir, relativePath);
  mkdirSync(fullPath, { recursive: true });
  return fullPath;
}
