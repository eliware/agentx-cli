import { describe, expect, test } from '@jest/globals';
import { wrapText } from '../src/text-wrap.mjs';

describe('text wrapping', () => {
  test('wrapText wraps on word boundaries when possible', () => {
    expect(wrapText('hello world there', 8)).toBe('hello\nworld\nthere');
  });

  test('wrapText falls back to hard wrapping for long words', () => {
    expect(wrapText('supercalifragilistic', 8)).toBe('supercal\nifragili\nstic');
  });
});
