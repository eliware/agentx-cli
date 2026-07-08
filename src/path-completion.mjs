import path from 'node:path';
import { fs } from '@eliware/common';
import { getPathModule } from './platform.mjs';

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
  /* istanbul ignore next */
  if (!match) return null;
  let token = match[1];
  if (token.startsWith('//') && !token.startsWith('///')) token = token.slice(1);
  return token;
}

function tokenPrefix(token, platform) {
  const pathApi = getPathModule(platform);
  const hasSeparator = /[\\/]/.test(token);
  if (!hasSeparator) return { baseDir: '.', prefix: '', needle: token };

  const dirPart = pathApi.dirname(token);
  const prefix = dirPart === '.' ? '' : `${pathApi.normalize(dirPart)}${dirPart.endsWith(pathApi.sep) ? '' : pathApi.sep}`;
  return {
    baseDir: pathApi.isAbsolute(dirPart) ? dirPart : (dirPart === '.' ? '.' : dirPart),
    prefix,
    needle: pathApi.basename(token),
  };
}

export async function completePath(line, cwd, platform = process.platform) {
  const token = splitToken(line);
  /* istanbul ignore next */
  if (token == null) return [[], line];

  const pathApi = getPathModule(platform);
  const { baseDir, prefix, needle } = tokenPrefix(token, platform);
  const resolvedBase = baseDir === '.' ? cwd : pathApi.isAbsolute(baseDir) ? baseDir : pathApi.resolve(cwd, baseDir);
  const entries = await listEntries(resolvedBase);
  const matches = entries
    .filter((entry) => {
      if (!needle) return true;
      if (needle.startsWith('.')) return entry.name.startsWith(needle);
      return !entry.name.startsWith('.') && entry.name.startsWith(needle);
    })
    .map((entry) => `${prefix}${escapeCompletionToken(entry.name)}${entry.isDirectory() ? pathApi.sep : ''}`)
    .sort((a, b) => a.localeCompare(b));

  return [matches, token];
}

export { splitToken, tokenPrefix };
