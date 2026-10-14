import { describe, expect, test } from "@jest/globals";
import { formatTurnUsage, formatTurnUsageReport, formatUsageReport } from "../src/usage.mjs";

describe("usage reports", () => {
  test("formats cumulative and per-turn reports with optional fields", () => {
    expect(
      formatUsageReport({
        inputTokens: 10,
        cachedTokens: 2,
        cacheWriteTokens: 3,
        outputTokens: 4,
        reasoningTokens: 5,
        turns: 2,
      }),
    ).toContain('"write":"3 (');
    expect(formatUsageReport({ inputTokens: 3, cachedTokens: 2, outputTokens: 3, turns: 0 })).toBe(
      '{"in":"3 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","turns":"0","avg":"$0.000","total":"$0.000"}',
    );
    expect(formatUsageReport({ outputTokens: 2_000, turns: 2 })).toContain('"avg":"$0.001"');
    expect(formatTurnUsage({ inputTokens: 3, cachedTokens: 2, outputTokens: 3 })).toContain(
      '"turns":"1"',
    );
    expect(formatTurnUsage()).toContain('"turns":"1"');
    expect(formatUsageReport()).toContain('"turns":"0"');
    expect(formatTurnUsageReport()).toBe(
      '{"in":"0 ($0.000)","cache":"0 ($0.000)","out":"0 ($0.000)","total":"$0.000"}',
    );
    expect(
      formatTurnUsageReport({
        inputTokens: 3,
        cacheWriteTokens: 3,
        reasoningTokens: 5,
        outputTokens: 4,
      }),
    ).toContain('"reasoning":"5"');
  });

  test("normalizes ANSI in JSON output", () => {
    expect(formatUsageReport({ inputTokens: "\u001b[32m1\u001b[0m" })).toContain('"in":"1');
    expect(
      formatTurnUsageReport({ inputTokens: null, cachedTokens: null, outputTokens: null }),
    ).toContain('"in":"0');
  });
});
