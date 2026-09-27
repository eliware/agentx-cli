import { describe, expect, test } from "@jest/globals";
import {
  formatMoney,
  formatTurnUsage,
  formatTurnUsageReport,
  formatUsageReport,
} from "../src/usage.mjs";

describe("usage reports", () => {
  test("formats money with stable thousandth rounding", () => {
    expect(formatMoney(1_500_000n)).toBe("$0.002");
    expect(formatMoney(1.2345)).toBe("$1.235");
    expect(formatMoney(undefined)).toBe("$0.000");
    expect(formatMoney(-1_500_000n)).toBe("$-0.002");
    expect(formatMoney(-1.2345)).toBe("$-1.235");
    expect(formatMoney(-0.0004)).toBe("$0.000");
  });

  test("formats cumulative and per-turn reports with optional fields", () => {
    expect(
      formatUsageReport({
        inputTokens: 1,
        cachedTokens: 2,
        cacheWriteTokens: 3,
        outputTokens: 4,
        reasoningTokens: 5,
        turns: 2,
      }),
    ).toContain('"write":"3 (');
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 0 })).toBe(
      '{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","turns":"0","avg":"$0.000","total":"$0.000"}',
    );
    expect(formatUsageReport({ outputTokens: 2_000, turns: 2 })).toContain('"avg":"$0.001"');
    expect(formatTurnUsage({ inputTokens: 1, cachedTokens: 2, outputTokens: 3 })).toContain(
      '"turns":"1"',
    );
    expect(formatTurnUsage()).toContain('"turns":"1"');
    expect(formatUsageReport()).toContain('"turns":"0"');
    expect(formatTurnUsageReport()).toBe(
      '{"in":"0 ($0.000)","cache":"0 ($0.000)","out":"0 ($0.000)","total":"$0.000"}',
    );
    expect(
      formatTurnUsageReport({ cacheWriteTokens: 3, reasoningTokens: 5, outputTokens: 4 }),
    ).toContain('"reasoning":"5"');
  });

  test("includes the long-context warning and normalizes ANSI in JSON output", () => {
    const report = formatUsageReport({
      inputTokens: 272_001,
      cachedTokens: 0,
      outputTokens: 1,
      turns: 1,
    });
    expect(report).toContain("Long-context pricing applied");
    expect(report).toContain("\u001b[91m");
    expect(formatUsageReport({ inputTokens: "\u001b[32m1\u001b[0m" })).toContain('"in":"1');
    expect(
      formatTurnUsageReport({ inputTokens: null, cachedTokens: null, outputTokens: null }),
    ).toContain('"in":"0');
    expect(formatTurnUsageReport({ inputTokens: 272_001 })).toContain(
      "Long-context pricing applied",
    );
  });
});
