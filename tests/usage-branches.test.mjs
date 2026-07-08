import { describe, expect, test } from '@jest/globals';
import { normalizeUsage } from '../src/usage.mjs';

describe('usage branch coverage', () => {
  test('normalizes nullish fields', () => {
    expect(normalizeUsage({ inputTokens: null, cachedTokens: null, outputTokens: null })).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({ inputTokens: undefined, cachedTokens: undefined, outputTokens: undefined })).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
  });
});
