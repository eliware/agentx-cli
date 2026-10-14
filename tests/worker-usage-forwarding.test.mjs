import { expect, jest, test } from "@jest/globals";
import { reportWorkerUsage } from "../src/worker-usage-forwarding.mjs";

test("reports worker usage once and skips missing usage", () => {
  const usage = { turns: 2, inputTokens: 10, cachedTokens: 3, outputTokens: 4 };
  const onUsage = jest.fn();
  const worker = { status: "cancelled", usage, usageReported: false };
  expect(reportWorkerUsage(worker, onUsage)).toBe(true);
  expect(reportWorkerUsage(worker, onUsage)).toBe(false);
  expect(onUsage).toHaveBeenCalledWith(usage, worker);
  expect(reportWorkerUsage({ usageReported: false }, onUsage)).toBe(false);
  expect(reportWorkerUsage({ usage, usageReported: false })).toBe(true);
  expect(reportWorkerUsage({ usage: null, usageReported: false })).toBe(false);
});
