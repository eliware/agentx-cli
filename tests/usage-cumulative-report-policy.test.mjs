import { describe, expect, test } from "@jest/globals";
import { buildCumulativeUsageReport } from "../src/usage-cumulative-report-policy.mjs";

describe("cumulative usage report policy", () => {
  test("builds default totals and average cost", () => {
    expect(buildCumulativeUsageReport()).toMatchObject({ turns: "0", total: "$0.000" });
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
});
