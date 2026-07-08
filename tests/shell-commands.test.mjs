import { describe, expect, test } from '@jest/globals';
import { parseInternalCommand } from '../src/shell-commands.mjs';

describe('shell commands', () => {
  test('recognizes clear, usage, exit and cd commands', () => {
    expect(parseInternalCommand('clear')).toEqual({ type: 'clear' });
    expect(parseInternalCommand('/clear')).toEqual({ type: 'session_clear' });
    expect(parseInternalCommand('/usage')).toEqual({ type: 'usage' });
    expect(parseInternalCommand('quit')).toEqual({ type: 'exit' });
    expect(parseInternalCommand('exit')).toEqual({ type: 'exit' });
    expect(parseInternalCommand('/exit')).toEqual({ type: 'exit' });
    expect(parseInternalCommand('cd')).toEqual({ type: 'cd', target: '' });
    expect(parseInternalCommand('cd subdir')).toEqual({ type: 'cd', target: 'subdir' });
    expect(parseInternalCommand('unknown')).toBeNull();
  });
});
