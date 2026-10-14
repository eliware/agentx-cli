import { expect, jest, test } from "@jest/globals";
import { createPendingSessionUsage } from "../../src/agent/pending-session-usage.mjs";

test("accounts response usage and supports skipped turn increments", () => {
  const totals = { inputTokens: 0, turns: 0 };
  const addUsageTotals = jest.fn((target, delta) => {
    target.inputTokens += delta.inputTokens;
  });
  const usage = createPendingSessionUsage({ getSessionUsage: () => totals, addUsageTotals });
  expect(usage.onResponseUsage({ inputTokens: 3 })).toBe(totals);
  usage.onResponseUsage({ inputTokens: 4 }, { skipIncrement: true });
  expect(totals).toEqual({ inputTokens: 3, turns: 1 });
  expect(addUsageTotals).toHaveBeenCalledTimes(1);
});

test("adds worker usage and its turn count", () => {
  const totals = { inputTokens: 0, turns: 0 };
  const addUsageTotals = jest.fn((target, delta) => {
    target.inputTokens += delta.inputTokens;
  });
  const usage = createPendingSessionUsage({ getSessionUsage: () => totals, addUsageTotals });
  usage.onWorkerUsage({ inputTokens: 5, turns: 2 });
  usage.onWorkerUsage({ inputTokens: 1 });
  expect(totals).toEqual({ inputTokens: 6, turns: 2 });
});
