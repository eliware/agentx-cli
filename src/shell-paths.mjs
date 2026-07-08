import { fs } from '@eliware/common';
import { resolveUserPath } from './platform.mjs';

export async function resolveCdTarget(target, cwd, options = {}) {
  const resolved = resolveUserPath(target, cwd, options);
  const stats = await fs.promises.stat(resolved);
  if (!stats.isDirectory()) throw new Error(`cd: not a directory: ${target || resolved}`);
  return resolved;
}

export function buildWorkingDirectoryNote(nextCwd) {
  return `User changed working directory to ${nextCwd}`;
}
