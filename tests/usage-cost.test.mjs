import { describe, expect, test } from "@jest/globals";
import { API_PRICING, calculateUsageCostBreakdown } from "@eliware/openai";
import { AVAILABLE_MODELS, getUsageCostBreakdown } from "../src/usage-cost.mjs";

describe("OpenAI usage pricing adapter", () => {
  test("uses the OpenAI catalog for available model names", () => {
    expect(AVAILABLE_MODELS).toEqual(Object.keys(API_PRICING));
  });

  test("uses the OpenAI cost breakdown and falls back for unknown models", () => {
    const fields = {
      inputTokens: 1000,
      cachedTokens: 100,
      cacheWriteTokens: 50,
      outputTokens: 200,
    };
    expect(getUsageCostBreakdown(fields)).toEqual(
      calculateUsageCostBreakdown("gpt-6-luna", {
        input_tokens: 1000,
        output_tokens: 200,
        input_tokens_details: { cached_tokens: 100, cache_write_tokens: 50 },
      }),
    );
    expect(getUsageCostBreakdown({ ...fields, model: "unknown" })).toEqual(
      getUsageCostBreakdown(fields),
    );
  });

  test("uses catalog defaults when no cost fields are given", () => {
    expect(getUsageCostBreakdown()).toEqual(getUsageCostBreakdown({ model: "gpt-6-luna" }));
  });

  test("normalizes invalid counts and follows the library long-context threshold", () => {
    expect(getUsageCostBreakdown({ inputTokens: "\u001b[32m2\u001b[0m" }).input_tokens).toBe(2);
    expect(getUsageCostBreakdown({ inputTokens: -1 }).input_tokens).toBe(0);
  });
});
