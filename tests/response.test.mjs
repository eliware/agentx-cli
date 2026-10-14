import { describe, expect, test } from "@jest/globals";
import { formatUsageReport, formatTurnUsageReport, formatUsageSummary } from "../src/response.mjs";

const sampleUsage = {
  input_tokens: 5,
  input_tokens_details: { cached_tokens: 2 },
  output_tokens: 3,
};

describe("response helpers", () => {
  test("formats usage reports", () => {
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 })).toBe(
      '{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","turns":"4","avg":"$0.000","total":"$0.000"}',
    );
    expect(formatTurnUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3 })).toBe(
      '{"in":"1 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","total":"$0.000"}',
    );
    expect(formatUsageSummary({ usage: sampleUsage })).toBe(
      '{"in":"3 ($0.000)","cache":"2 ($0.000)","out":"3 ($0.000)","turns":"1","avg":"$0.000","total":"$0.000"}',
    );
  });
});
