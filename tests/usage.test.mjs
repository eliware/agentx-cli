import { describe, expect, test } from '@jest/globals';
import { calculateUsageCost, formatTurnUsage, formatTurnUsageReport, formatUsageReport, normalizeUsage } from '../src/usage.mjs';

describe('usage helpers', () => {
  test('normalize and format token counts', () => {
    expect(normalizeUsage(undefined)).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({})).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({ inputTokens: null, cachedTokens: null, outputTokens: null })).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({ inputTokens: undefined, cachedTokens: undefined, outputTokens: undefined })).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({ inputTokens: 12, cachedTokens: 5, outputTokens: 7 })).toEqual({ inputTokens: 7, cachedTokens: 5, outputTokens: 7 });
    expect(normalizeUsage({ inputTokens: 2, cachedTokens: 9, outputTokens: 1 })).toEqual({ inputTokens: 0, cachedTokens: 9, outputTokens: 1 });
    expect(calculateUsageCost({ inputTokens: 1_000_000, cachedTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(5.325);
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 })).toBe('{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","sum":"$0.000","msgs":"4","avg":"$0.000"}');
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 0 })).toBe('{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","sum":"$0.000","msgs":"0","avg":"$0.000"}');
    expect(formatTurnUsage({ inputTokens: 1, cachedTokens: 2, outputTokens: 3 })).toBe('{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","sum":"$0.000","msgs":"1","avg":"$0.000"}');
    expect(formatTurnUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3 })).toBe('{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","sum":"$0.000"}');
  });
});
