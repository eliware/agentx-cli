import path from 'node:path';
import { fs } from '@eliware/common';

async function listEntries(cwd) {
  try {
    return await fs.promises.readdir(cwd, { withFileTypes: true });
  } catch {
    return [];
  }
}

function escapeCompletionToken(token) {
  return token.includes(' ') ? `"${token.replaceAll('"', '\\"')}"` : token;
}

function splitToken(line) {
  const match = line.match(/(?:^|\s)([^ \t]*?)$/);
  if (!match) return null;
  let token = match[1];
  if (token.startsWith('//') && !token.startsWith('///')) token = token.slice(1);
  return token;
}

function tokenPrefix(token) {
  if (!token.includes('/')) return { baseDir: '.', prefix: '', needle: token };
  const dirPart = path.dirname(token);
  const baseDir = token.startsWith('/') ? path.resolve('/', dirPart) : dirPart === '.' ? '.' : dirPart;
  const prefix = token.startsWith('/')
    ? `${dirPart === '/' ? '' : dirPart.replace(/\/+/g, '/')}/`
    : dirPart && dirPart !== '.'
      ? `${dirPart.replace(/\/+/g, '/')}/`
      : '';
  return { baseDir, prefix, needle: path.basename(token) };
}

export async function completePath(line, cwd) {
  const token = splitToken(line);
  if (token == null) return [[], line];

  const { baseDir, prefix, needle } = tokenPrefix(token);
  const resolvedBase = baseDir === '.' ? cwd : path.resolve(cwd, baseDir);
  const entries = await listEntries(resolvedBase);
  const matches = entries
    .filter((entry) => {
      if (!needle) return true;
      if (needle.startsWith('.')) return entry.name.startsWith(needle);
      return !entry.name.startsWith('.') && entry.name.startsWith(needle);
    })
    .map((entry) => `${prefix}${escapeCompletionToken(entry.name)}${entry.isDirectory() ? '/' : ''}`)
    .sort((a, b) => a.localeCompare(b));

  return [matches, token];
}
