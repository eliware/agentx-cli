import { afterEach, describe, expect, test } from '@jest/globals';
import { parseInternalCommand } from '../src/shell-commands.mjs';
import { resolveCdTarget, buildWorkingDirectoryNote } from '../src/shell-paths.mjs';
import { formatPromptForCwd } from '../src/shell-display.mjs';
import { readAgentsFromCwdAndParents } from '../src/shell-agents.mjs';
import { cleanupTempDir, makeDirectory, makeFile, makeTempDir } from './test-helpers.mjs';

describe('shell helpers', () => {
  const tmp = makeTempDir('agentx-');

  afterEach(() => {
    cleanupTempDir(tmp);
  });

  test('parseInternalCommand recognizes clear and exit commands', () => {
    expect(parseInternalCommand('clear')).toEqual({ type: 'clear' });
    expect(parseInternalCommand('/clear')).toEqual({ type: 'session_clear' });
    expect(parseInternalCommand('/usage')).toEqual({ type: 'usage' });
    expect(parseInternalCommand('quit')).toEqual({ type: 'exit' });
    expect(parseInternalCommand('exit')).toEqual({ type: 'exit' });
  });

  test('resolveCdTarget accepts relative and absolute directories', async () => {
    makeDirectory(tmp, 'sub');
    expect(await resolveCdTarget('sub', tmp)).toBe(`${tmp}/sub`);
    expect(await resolveCdTarget(`${tmp}/sub`, tmp)).toBe(`${tmp}/sub`);
  });

  test('buildWorkingDirectoryNote describes the cwd change', () => {
    expect(buildWorkingDirectoryNote('/tmp/work')).toBe('User changed working directory to /tmp/work');
  });

  test('formatPromptForCwd includes the active cwd', () => {
    expect(formatPromptForCwd('/tmp/work')).toContain('/tmp/work');
  });

  test('readAgentsFromCwdAndParents merges parent AGENTS files', async () => {
    makeDirectory(tmp, 'parent/child');
    makeFile(tmp, 'AGENTS.md', 'root');
    makeFile(tmp, 'parent/AGENTS.md', 'parent');
    const text = await readAgentsFromCwdAndParents(`${tmp}/parent/child`);
    expect(text).toContain('root');
    expect(text).toContain('parent');
  });
});
