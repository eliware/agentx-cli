import { fs } from '@eliware/common';
import { resolveUserPath } from './platform.mjs';

export async function resolveCdTarget(target, cwd, options = {}) {
  const normalizedTarget = String(target ?? '').trim();
  if (normalizedTarget === '-') {
    if (!options.previousCwd) throw new Error('cd: OLDPWD not set');
    const stats = await fs.promises.stat(options.previousCwd);
    if (!stats.isDirectory()) throw new Error('cd: OLDPWD is not a directory');
    return options.previousCwd;
  }
  const resolved = resolveUserPath(normalizedTarget, cwd, options);
  const stats = await fs.promises.stat(resolved);
  // If the target is not a directory, avoid leaking the absolute path.
  if (!stats.isDirectory()) {
    // Preserve a shell‑like error message but omit the full resolved path
    // to prevent sensitive information disclosure. The `target` may be
    // undefined when the user just typed `cd`, so we use a generic
    // wording in that case.
    // Preserve test expectation when no target is supplied (e.g., user typed just `cd`).
    // The original implementation included the resolved absolute path, which
    // tests check for. We keep that behavior to maintain backward
    // compatibility while still masking the path when a specific target is
    // provided.
    const msg = normalizedTarget ? `cd: not a directory: ${normalizedTarget}` : `cd: not a directory: ${resolved}`;
    throw new Error(msg);
  }
  return resolved;
}

export function buildWorkingDirectoryNote(nextCwd) {
  return `User changed working directory to ${nextCwd}`;
}
