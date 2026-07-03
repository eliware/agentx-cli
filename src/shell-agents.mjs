import path from 'node:path';
import { fs } from '@eliware/common';

export async function readAgentsFromCwdAndParents(cwd) {
  const parts = [];
  let current = path.resolve(cwd);
  for (;;) {
    try {
      const content = await fs.promises.readFile(path.join(current, 'AGENTS.md'), 'utf8');
      parts.unshift({ cwd: current, content });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return parts.map(({ cwd: dir, content }) => `# AGENTS.md (${dir})\n${content.trim()}`).join('\n\n');
}
