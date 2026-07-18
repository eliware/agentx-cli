import { describe, expect, test } from '@jest/globals';
import { calculateUsageCost, calculateUsageCostNanoDollars, formatMoney, formatTurnUsage, formatTurnUsageReport, formatUsageReport, getModelPricing, isJumboPrompt, normalizeUsage } from '../src/usage.mjs';

describe('usage helpers', () => {
  test('normalize and format token counts', () => {
    expect(normalizeUsage(undefined)).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({})).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({ inputTokens: null, cachedTokens: null, outputTokens: null })).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({ inputTokens: undefined, cachedTokens: undefined, outputTokens: undefined })).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({ inputTokens: 12, cachedTokens: 5, outputTokens: 7 })).toEqual({ inputTokens: 7, cachedTokens: 5, outputTokens: 7 });
    expect(normalizeUsage({ inputTokens: 2, cachedTokens: 9, outputTokens: 1 })).toEqual({ inputTokens: 0, cachedTokens: 9, outputTokens: 1 });
    expect(calculateUsageCostNanoDollars({ inputTokens: 1_000_000, cachedTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(7_100_000_000n);
    expect(formatMoney(1_500_000n)).toBe('$0.002');
    expect(formatMoney(1.2345)).toBe('$1.235');
    expect(formatMoney(undefined)).toBe('$0.000');
    expect(formatMoney(-1_500_000n)).toBe('$-0.002');
    expect(calculateUsageCost({ inputTokens: 1_000_000, cachedTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(7.1);
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 })).toBe('{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","turns":"4","avg":"$0.000","total":"$0.000"}');
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 0 })).toBe('{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","turns":"0","avg":"$0.000","total":"$0.000"}');
    expect(formatTurnUsage({ inputTokens: 1, cachedTokens: 2, outputTokens: 3 })).toBe('{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","turns":"1","avg":"$0.000","total":"$0.000"}');
    expect(formatTurnUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3 })).toBe('{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","total":"$0.000"}');
  });

  test('uses model-specific pricing', () => {
    expect(getModelPricing('gpt-5.6-terra')).toEqual({ input: 2_500n, cached: 250n, output: 15_000n });
    expect(calculateUsageCost({ model: 'gpt-5.6-sol', inputTokens: 1_000_000, cachedTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(35.5);
  });

  test('applies jumbo pricing to all token classes and reports a warning', () => {
    expect(isJumboPrompt({ inputTokens: 270_001 })).toBe(true);
    expect(calculateUsageCost({ inputTokens: 270_001, cachedTokens: 0, outputTokens: 1, model: 'gpt-5.6-luna' })).toBeCloseTo(0.540008);
    const report = formatUsageReport({ inputTokens: 270_001, cachedTokens: 1, outputTokens: 1, turns: 1, model: 'gpt-5.6-terra' });
    expect(report).toContain('Jumbo prompt pricing applied (2x)');
    expect(report).toContain('\u001b[91m');
  });

  test('formats totals from token counts without per-turn rounding drift', () => {
    expect(formatUsageReport({ inputTokens: 0, cachedTokens: 0, outputTokens: 2_000, turns: 2 })).toBe('{"in":"0 ($0.000)","cache":"0 ($0.000)","out":"2,000 ($0.012)","turns":"2","avg":"$0.006","total":"$0.012"}');
  });
});
