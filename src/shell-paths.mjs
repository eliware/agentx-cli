import path from 'node:path';
import { fs } from '@eliware/common';

export async function resolveCdTarget(target, cwd) {
  const rawTarget = target || process.env.HOME || cwd;
  const nextPath = rawTarget.startsWith('~')
    ? rawTarget.replace(/^~(?=$|\/)/, process.env.HOME || cwd)
    : rawTarget;
  const resolved = path.isAbsolute(nextPath) ? nextPath : path.resolve(cwd, nextPath);
  const stats = await fs.promises.stat(resolved);
  if (!stats.isDirectory()) throw new Error(`cd: not a directory: ${target || rawTarget}`);
  return resolved;
}

export function buildWorkingDirectoryNote(nextCwd) {
  return `User changed working directory to ${nextCwd}`;
}
