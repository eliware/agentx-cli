import path from 'node:path';
import { fs } from '@eliware/common';
import { getHomeDirectory } from './platform.mjs';

async function readAgentsEntry(dir) {
  const filePath = path.join(dir, 'AGENTS.md');
  try {
    const [content, stats, realPath] = await Promise.all([
      fs.promises.readFile(filePath, 'utf8'),
      fs.promises.lstat(filePath),
      fs.promises.realpath(filePath),
    ]);
    return { dir, content, realPath, isSymlink: stats.isSymbolicLink() };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function readAgentsFromCwdAndParents(cwd, home = getHomeDirectory()) {
  const entries = [];
  const homeEntry = home ? await readAgentsEntry(path.resolve(home)) : null;
  const seenRealPaths = new Set();
  let current = path.resolve(cwd);

  for (; ;) {
    const entry = await readAgentsEntry(current);
    if (entry && !seenRealPaths.has(entry.realPath)) {
      seenRealPaths.add(entry.realPath);
      entries.push(entry);
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const ordered = entries.reverse();
  if (homeEntry && !seenRealPaths.has(homeEntry.realPath)) ordered.unshift(homeEntry);
  return ordered.map(({ dir, content }) => `# AGENTS.md (${dir})\n${content.trim()}`).join('\n\n');
}
