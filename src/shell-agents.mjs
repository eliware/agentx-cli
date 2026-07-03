import path from 'node:path';
import { fs } from '@eliware/common';

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

export async function readAgentsFromCwdAndParents(cwd) {
  const entries = [];
  const seenRealPaths = new Set();
  let current = path.resolve(cwd);

  for (;;) {
    const entry = await readAgentsEntry(current);
    if (entry && !seenRealPaths.has(entry.realPath)) {
      seenRealPaths.add(entry.realPath);
      entries.push(entry);
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return entries.reverse().map(({ dir, content }) => `# AGENTS.md (${dir})\n${content.trim()}`).join('\n\n');
}
