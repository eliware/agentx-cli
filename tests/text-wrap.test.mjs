import { describe, expect, test } from '@jest/globals';
import { getTerminalWidth, wrapText } from '../src/text-wrap.mjs';

describe('text wrapping', () => {
  test('getTerminalWidth falls back when the terminal width is unavailable', () => {
    const originalColumns = process.stdout.columns;
    process.stdout.columns = 0;
    try {
      expect(getTerminalWidth(72)).toBe(72);
    } finally {
      process.stdout.columns = originalColumns;
    }
  });

  test('getTerminalWidth uses the live terminal width when present', () => {
    const originalColumns = process.stdout.columns;
    process.stdout.columns = 99;
    try {
      expect(getTerminalWidth(72)).toBe(99);
    } finally {
      process.stdout.columns = originalColumns;
    }
  });

  test('wrapText handles blank lines, ansi text, invalid widths and long words', () => {
    expect(wrapText('\n', 10)).toBe('\n');
    expect(wrapText('   ', 10)).toBe('   ');
    expect(wrapText('', 10)).toBe('');
    expect(wrapText(undefined, 10)).toBe('');
    expect(wrapText('one\ntwo', 10)).toBe('one\ntwo');
    expect(wrapText('  spaced words', 7)).toBe('spaced\nwords');
    expect(wrapText('hello world', 5)).toBe('hello\nworld');
    expect(wrapText('abc def ', 3)).toBe('abc\ndef');
    const ansiWrapped = wrapText('\u001b[31mred text\u001b[0m more', 8);
    expect(ansiWrapped).toContain('\u001b[31mred text\u001b[0m');
    expect(ansiWrapped).toContain('\nmore');
    expect(wrapText('keep me', 0)).toBe('keep me');
    expect(wrapText('short')).toBe('short');
    expect(wrapText('hello world there', 8)).toBe('hello\nworld\nthere');
    expect(wrapText('supercalifragilistic', 8)).toBe('supercal\nifragili\nstic');
  });
});
