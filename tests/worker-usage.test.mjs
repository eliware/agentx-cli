import { describe, expect, test } from "@jest/globals";
import { parseWorkerUsage, reportWorkerUsage } from "../src/worker-usage.mjs";

describe("worker usage policies", () => {
  test("parses structured, cumulative, and colorized usage summaries", () => {
    expect(
      parseWorkerUsage(
        '{"in":"12 ($0.000)","cache":"3 ($0.000)","out":"7 ($0.000)","total":"$0.000"}',
      ),
    ).toEqual({ turns: 1, inputTokens: 12, cachedTokens: 3, outputTokens: 7 });
    expect(
      parseWorkerUsage(
        '{"in":"1,200 ($0.004)","cache":"300 ($0.000)","out":"70 ($0.000)","total":"$0.004"}\n{"in":"800 ($0.002)","cache":"100 ($0.000)","out":"30 ($0.000)","total":"$0.002"}\n{"in":"2,000","cache":"400","out":"100","turns":"3"}',
      ),
    ).toEqual({ turns: 2, inputTokens: 2000, cachedTokens: 400, outputTokens: 100 });
    expect(
      parseWorkerUsage(
        '{"in":"1,200 ($0.004)","cache":"300 ($0.000)","out":"70 ($0.000)","total":"$0.004","turns":"2","avg":"$0.002"}\n{"in":"2,000 ($0.004)","cache":"400 ($0.000)","out":"100 ($0.000)","total":"$0.004"}',
      ),
    ).toEqual({ turns: 1, inputTokens: 2000, cachedTokens: 400, outputTokens: 100 });
    expect(
      parseWorkerUsage(
        '{"in":"1 ($0.000)","cache":"0 ($0.000)","out":"2 ($0.000)","turns":"1","avg":"$0.000","total":"$0.000"}\n{"in":"3 ($0.000)","cache":"1 ($0.000)","out":"4 ($0.000)","turns":"2","avg":"$0.000","total":"$0.000"}',
      ),
    ).toBeNull();
    expect(parseWorkerUsage("no usage")).toBeNull();
    expect(
      parseWorkerUsage('{"in":"1","cache":"2","write":"3","out":"4","reasoning":"5"}'),
    ).toEqual({
      turns: 1,
      inputTokens: 1,
      cachedTokens: 2,
      cacheWriteTokens: 3,
      outputTokens: 4,
      reasoningTokens: 5,
    });
    expect(
      parseWorkerUsage(
        '{"in":"9","cache":"2","out":"1","avg":"$0.001"}\n{"in":"3","cache":"1","out":"2"}',
      ),
    ).toEqual({ turns: 1, inputTokens: 3, cachedTokens: 1, outputTokens: 2 });
    const colored = `${String.fromCharCode(27)}[33m${JSON.stringify({ in: "3 ($0.000)", cache: "1 ($0.000)", out: "2 ($0.000)", total: "$0.000" })}${String.fromCharCode(27)}[0m`;
    expect(parseWorkerUsage(colored)).toEqual({
      turns: 1,
      inputTokens: 3,
      cachedTokens: 1,
      outputTokens: 2,
    });
  });

  test("reports usage exactly once, including canceled workers", () => {
    const usage = { turns: 2, inputTokens: 10, cachedTokens: 3, outputTokens: 4 };
    const reported = [];
    const worker = { status: "cancelled", usage, usageReported: false };
    expect(reportWorkerUsage(worker, (value) => reported.push(value))).toBe(true);
    expect(reportWorkerUsage(worker, (value) => reported.push(value))).toBe(false);
    expect(reported).toEqual([usage]);
    expect(reportWorkerUsage({ usageReported: false }, undefined)).toBe(false);
    expect(reportWorkerUsage({ usage, usageReported: false })).toBe(true);
    expect(reportWorkerUsage({ usage: null, usageReported: false })).toBe(false);
  });
});
