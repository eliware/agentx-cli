import { describe, expect, test } from '@jest/globals';
import { parseInternalCommand } from '../src/shell-commands.mjs';

describe('shell commands', () => {
  test.each([
    ['quit', { type: 'exit' }],
    ['exit', { type: 'exit' }],
    ['/quit', { type: 'exit' }],
    ['/exit', { type: 'exit' }],
    [' clear ', { type: 'session_clear' }],
    ['/clear', { type: 'session_clear' }],
    ['/setup', { type: 'setup' }],
    ['/usage', { type: 'usage' }],
    ['/rollback', { type: 'rollback' }],
    ['/stop', { type: 'goal_cancel' }],
    ['cd', { type: 'cd', target: '' }],
    ['cd subdir', { type: 'cd', target: 'subdir' }],
    ['cd  subdir  ', { type: 'cd', target: 'subdir' }],
  ])('parses %j', (input, expected) => {
    expect(parseInternalCommand(input)).toEqual(expected);
  });

  test.each([
    ['/goal status', { type: 'goal_status' }],
    ['/goal resume', { type: 'goal_resume' }],
    ['/goal continue', { type: 'goal_resume' }],
    ['/goal cancel', { type: 'goal_cancel' }],
    ['/goal stop', { type: 'goal_cancel' }],
    ['/goal build the project', { type: 'goal', goal: 'build the project' }],
    ['/goal', { type: 'goal_help' }],
    ['/goal   ', { type: 'goal_help' }],
  ])('parses goal command %j', (input, expected) => {
    expect(parseInternalCommand(input)).toEqual(expected);
  });

  test('returns null for non-commands and does not trim internal content', () => {
    expect(parseInternalCommand('unknown')).toBeNull();
    expect(parseInternalCommand(' goal status')).toBeNull();
    expect(parseInternalCommand('cdx')).toBeNull();
    expect(parseInternalCommand('clear now')).toBeNull();
    expect(parseInternalCommand('')).toBeNull();
    expect(parseInternalCommand('   ')).toBeNull();
  });
});
