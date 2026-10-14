import { describe, expect, test } from "@jest/globals";
import {
  buildCumulativeUsageReport,
  buildTurnUsageReport,
  JUMBO_WARNING,
} from "../src/usage-report-policy.mjs";

describe("usage report policy", () => {
  test("builds default cumulative and turn reports", () => {
    expect(buildCumulativeUsageReport()).toMatchObject({ turns: "0", total: "$0.000" });
    expect(buildTurnUsageReport()).toMatchObject({ total: "$0.000" });
  });
  test("assembles cumulative totals and average cost", () => {
    expect(buildCumulativeUsageReport({ outputTokens: 2000, turns: 2 })).toMatchObject({
      turns: "2",
      avg: "$0.001",
      total: "$0.001",
    });
  });

  test("uses zero average when no turns have completed", () => {
    expect(buildCumulativeUsageReport({ outputTokens: 2000 })).toMatchObject({
      turns: "0",
      avg: "$0.000",
    });
  });

  test("adds long-context warnings to both report types", () => {
    const usage = { inputTokens: 272_001, outputTokens: 1 };
    expect(buildCumulativeUsageReport(usage).warning).toBe(JUMBO_WARNING);
    expect(buildTurnUsageReport(usage).warning).toBe(JUMBO_WARNING);
    expect(buildTurnUsageReport({ outputTokens: 1 })).not.toHaveProperty("warning");
  });
});
