import { describe, expect, test } from '@jest/globals';
import { calculateUsageCost, calculateUsageCostNanoDollars, formatMoney, formatTurnUsage, formatTurnUsageReport, formatUsageReport, getModelPricing, isJumboPrompt, normalizeUsage } from '../src/usage.mjs';

describe('usage branch coverage', () => {
  test('normalizes nullish fields', () => {
    expect(normalizeUsage({ inputTokens: null, cachedTokens: null, outputTokens: null })).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(normalizeUsage({ inputTokens: undefined, cachedTokens: undefined, outputTokens: undefined })).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
  });
});

describe('usage edge branches', () => {
  test('uses defaults and falls back for model names', () => {
    expect(getModelPricing()).toEqual(getModelPricing('gpt-5.6-luna'));
    expect(getModelPricing(undefined)).toEqual(getModelPricing());
    expect(Reflect.apply(getModelPricing, null, [])).toEqual(getModelPricing());
    expect(getModelPricing(null)).toEqual(getModelPricing());
    expect(getModelPricing('unknown-model')).toEqual(getModelPricing());
    expect(getModelPricing('GPT-5.6-TERRA')).toEqual({ input: 2_500n, cached: 250n, output: 15_000n });
  });

  test('handles jumbo threshold and default usage fields', () => {
    expect(isJumboPrompt()).toBe(false);
    expect(isJumboPrompt({ inputTokens: undefined, cachedTokens: undefined })).toBe(false);
    expect(isJumboPrompt({ inputTokens: null, cachedTokens: null })).toBe(false);
    expect(Reflect.apply(isJumboPrompt, null, [])).toBe(false);
    expect(calculateUsageCost()).toBe(0);
    expect(calculateUsageCost({ inputTokens: undefined, cachedTokens: undefined, outputTokens: undefined, model: undefined })).toBe(0);
    expect(isJumboPrompt({ inputTokens: 270_000, cachedTokens: 1 })).toBe(false);
    expect(isJumboPrompt({ inputTokens: 270_001, cachedTokens: 1 })).toBe(true);
    expect(calculateUsageCostNanoDollars()).toBe(0n);
    expect(calculateUsageCostNanoDollars({ inputTokens: undefined, cachedTokens: undefined, outputTokens: undefined, model: undefined })).toBe(0n);
    expect(Reflect.apply(calculateUsageCostNanoDollars, null, [])).toBe(0n);
    expect(calculateUsageCostNanoDollars({ inputTokens: 1.9, cachedTokens: -2, outputTokens: null })).toBe(1_000n);
  });

  test('formats negative and fractional values', () => {
    expect(formatMoney(-1.2345)).toBe('$-1.235');
    expect(formatMoney(-0.0004)).toBe('$0.000');
    expect(formatTurnUsage()).toContain('"turns":"1"');
    expect(formatUsageReport({ inputTokens: null, cachedTokens: null, outputTokens: null })).toBe('{"in":"0 ($0.000)","cache":"0 ($0.000)","out":"0 ($0.000)","turns":"0","avg":"$0.000","total":"$0.000"}');
    expect(formatUsageReport()).toBe('{"in":"0 ($0.000)","cache":"0 ($0.000)","out":"0 ($0.000)","turns":"0","avg":"$0.000","total":"$0.000"}');
    expect(formatTurnUsageReport()).toBe('{"in":"0 ($0.000)","cache":"0 ($0.000)","out":"0 ($0.000)","total":"$0.000"}');
    expect(formatTurnUsageReport({ inputTokens: 270_001, cachedTokens: 0, outputTokens: 1 })).toContain('Jumbo prompt pricing applied');
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 0, outputTokens: 1, turns: undefined, model: undefined })).toContain('"turns":"0"');
    expect(formatTurnUsageReport({ inputTokens: undefined, cachedTokens: undefined, outputTokens: undefined, model: undefined })).toContain('"total":"$0.000"');
  });
});
