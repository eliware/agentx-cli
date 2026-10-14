import { describe, expect, test } from "@jest/globals";
import { addTurn, addUsageTotals, createUsageTotals } from "../src/usage-totals.mjs";

describe("usage totals", () => {
  test("accumulates provider-independent usage and turns", () => {
    const totals = createUsageTotals();
    addUsageTotals(totals, { inputTokens: 1, cachedTokens: 2, outputTokens: 3 });
    addUsageTotals(totals, { inputTokens: 4, cachedTokens: 5, outputTokens: 6 });
    addTurn(totals);
    addTurn(totals);
    expect(totals).toEqual({ inputTokens: 5, cachedTokens: 7, outputTokens: 9, turns: 2 });
  });

  test("handles absent usage and optional cache and reasoning totals", () => {
    expect(addUsageTotals(createUsageTotals(), undefined)).toEqual({
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      turns: 0,
    });
    expect(
      addUsageTotals(createUsageTotals(), {
        inputTokens: 1,
        cachedTokens: 2,
        cacheWriteTokens: 3,
        outputTokens: 4,
        reasoningTokens: 5,
      }),
    ).toEqual({
      inputTokens: 1,
      cachedTokens: 2,
      cacheWriteTokens: 3,
      outputTokens: 4,
      reasoningTokens: 5,
      turns: 0,
    });
    expect(addTurn(createUsageTotals())).toEqual({
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      turns: 1,
    });
  });
});
