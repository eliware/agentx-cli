import { describe, expect, test } from "@jest/globals";
import { createSessionWorkerUsageCallback } from "../../src/agent/session-worker-usage-accounting.mjs";

describe("session worker usage accounting", () => {
  test("adds worker usage and its reported turn count", () => {
    const usage = { inputTokens: 1, cachedTokens: 0, outputTokens: 2, turns: 0 };
    const callback = createSessionWorkerUsageCallback({
      getSessionUsage: () => usage,
      addUsageTotals: (totals, delta) => {
        totals.inputTokens += delta.inputTokens;
        totals.cachedTokens += delta.cachedTokens;
        totals.outputTokens += delta.outputTokens;
      },
    });
    callback({ inputTokens: 5, cachedTokens: 2, outputTokens: 7, turns: 3 });
    expect(usage).toEqual({ inputTokens: 6, cachedTokens: 2, outputTokens: 9, turns: 3 });
  });

  test("does not add turns when worker usage omits the count", () => {
    const usage = { turns: 1 };
    const callback = createSessionWorkerUsageCallback({
      getSessionUsage: () => usage,
      addUsageTotals: () => {},
    });
    callback({});
    expect(usage.turns).toBe(1);
  });
});
