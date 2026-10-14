import { expect, jest, test } from "@jest/globals";
import { createSessionUsageCallbacks } from "../../src/agent/session-usage-accounting.mjs";

test("accounts response usage and supports skipped turn increments", () => {
  const totals = { inputTokens: 0, turns: 0 };
  const addUsageTotals = jest.fn((target, delta) => {
    target.inputTokens += delta.inputTokens;
  });
  const usage = createSessionUsageCallbacks({ getSessionUsage: () => totals, addUsageTotals });
  expect(usage.onResponseUsage({ inputTokens: 3 })).toBe(totals);
  usage.onResponseUsage({ inputTokens: 4 }, { skipIncrement: true });
  expect(totals).toEqual({ inputTokens: 3, turns: 1 });
  expect(addUsageTotals).toHaveBeenCalledTimes(1);
});

test("adds worker usage and its turn count", () => {
  const totals = { inputTokens: 1, cachedTokens: 0, outputTokens: 2, turns: 0 };
  const addUsageTotals = jest.fn((target, delta) => {
    target.inputTokens += delta.inputTokens;
    target.cachedTokens += delta.cachedTokens || 0;
    target.outputTokens += delta.outputTokens || 0;
  });
  const usage = createSessionUsageCallbacks({ getSessionUsage: () => totals, addUsageTotals });
  usage.onWorkerUsage({ inputTokens: 5, cachedTokens: 2, outputTokens: 7, turns: 3 });
  expect(totals).toEqual({ inputTokens: 6, cachedTokens: 2, outputTokens: 9, turns: 3 });
  usage.onWorkerUsage({});
  expect(totals.turns).toBe(3);
});
