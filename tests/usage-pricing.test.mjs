import { describe, expect, test } from "@jest/globals";
import {
  calculateUsageCost,
  calculateUsageCostNanoDollars,
  getModelPricing,
  isJumboPrompt,
} from "../src/usage-pricing.mjs";

describe("usage pricing", () => {
  test("uses model-specific rates and defaults unknown models to GPT-6 Luna", () => {
    expect(getModelPricing("gpt-6-luna")).toEqual({
      input: 100n,
      cached: 10n,
      cacheWrite: 125n,
      output: 500n,
    });
    expect(getModelPricing("GPT-5.6-TERRA")).toEqual({
      input: 2_000n,
      cached: 200n,
      cacheWrite: 2_500n,
      output: 12_000n,
    });
    expect(getModelPricing("unknown")).toEqual(getModelPricing());
    expect(getModelPricing(null)).toEqual(getModelPricing());
    expect(getModelPricing(undefined)).toEqual(getModelPricing());
  });

  test("calculates short- and long-context costs in integer nano-dollars", () => {
    expect(
      calculateUsageCostNanoDollars({
        inputTokens: 1_000_000,
        cachedTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(610_000_000n);
    expect(
      calculateUsageCost({
        model: "gpt-6-luna",
        inputTokens: 1_000_000,
        cachedTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.735);
    expect(
      calculateUsageCost({
        model: "gpt-6-luna",
        inputTokens: 272_001,
        cacheWriteTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(1.0544002);
    expect(
      calculateUsageCost({
        model: "gpt-5.6-sol",
        inputTokens: 1_000_000,
        cachedTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(35.5);
  });

  test("applies long-context threshold and clamps invalid token counts", () => {
    expect(isJumboPrompt()).toBe(false);
    expect(isJumboPrompt({ inputTokens: 272_000 })).toBe(false);
    expect(isJumboPrompt({ inputTokens: 272_001 })).toBe(true);
    expect(isJumboPrompt({ inputTokens: 272_002, cachedTokens: 1 })).toBe(true);
    expect(isJumboPrompt({ inputTokens: null, cachedTokens: null })).toBe(false);
    expect(calculateUsageCost()).toBe(0);
    expect(calculateUsageCostNanoDollars()).toBe(0n);
    expect(
      calculateUsageCostNanoDollars({ inputTokens: 1.9, cachedTokens: -2, outputTokens: null }),
    ).toBe(100n);
    expect(calculateUsageCostNanoDollars({ inputTokens: "\u001b[32m2\u001b[0m" })).toBe(200n);
    expect(
      calculateUsageCostNanoDollars({ inputTokens: "not a number", cachedTokens: Infinity }),
    ).toBe(0n);
  });
});
