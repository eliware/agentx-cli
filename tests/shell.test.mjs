import { describe, expect, test } from '@jest/globals';
import * as shell from '../src/shell.mjs';
import { parseInternalCommand } from '../src/shell-commands.mjs';
import { clearTerminal, formatCommandMessage, formatInfoMessage, formatPromptForCwd, formatSystemMessage } from '../src/shell-display.mjs';
import { buildWorkingDirectoryNote, resolveCdTarget } from '../src/shell-paths.mjs';
import { readAgentsFromCwdAndParents } from '../src/shell-agents.mjs';

describe('shell wrapper', () => {
  test('re-exports the shell helpers', () => {
    expect(shell.parseInternalCommand).toBe(parseInternalCommand);
    expect(shell.formatPromptForCwd).toBe(formatPromptForCwd);
    expect(shell.formatSystemMessage).toBe(formatSystemMessage);
    expect(shell.formatCommandMessage).toBe(formatCommandMessage);
    expect(shell.formatInfoMessage).toBe(formatInfoMessage);
    expect(shell.clearTerminal).toBe(clearTerminal);
    expect(shell.buildWorkingDirectoryNote).toBe(buildWorkingDirectoryNote);
    expect(shell.resolveCdTarget).toBe(resolveCdTarget);
    expect(shell.readAgentsFromCwdAndParents).toBe(readAgentsFromCwdAndParents);
  });

  test('exposes parseInternalCommand behavior through the wrapper', () => {
    expect(shell.parseInternalCommand('cd subdir')).toEqual({ type: 'cd', target: 'subdir' });
    expect(shell.parseInternalCommand('exit')).toEqual({ type: 'exit' });
  });
});
