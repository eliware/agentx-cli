import { describe, expect, test } from "@jest/globals";
import { buildUsageReport } from "../src/usage-report-builder.mjs";

describe("usage report builder", () => {
  test("builds token and cost fields, including optional cache and reasoning fields", () => {
    const { pricing, report } = buildUsageReport({
      inputTokens: 10,
      cachedTokens: 2,
      cacheWriteTokens: 3,
      outputTokens: 4,
      reasoningTokens: 5,
    });
    expect(pricing.cached_tokens).toBe(2);
    expect(report).toMatchObject({
      in: expect.stringMatching(/^10 \(/),
      cache: expect.stringMatching(/^2 \(/),
      write: expect.stringMatching(/^3 \(/),
      out: expect.stringMatching(/^4 \(/),
      reasoning: "5",
    });
  });

  test("omits zero cache-write and disabled or empty reasoning fields", () => {
    expect(buildUsageReport({ cacheWriteTokens: 0, reasoningTokens: 2 }, false).report).toEqual({
      in: "0 ($0.000)",
      cache: "0 ($0.000)",
      out: "0 ($0.000)",
    });
    expect(buildUsageReport({ reasoningTokens: 0 }).report).not.toHaveProperty("reasoning");
  });

  test("uses default fields and supports a selected model", () => {
    expect(buildUsageReport().report).toEqual({
      in: "0 ($0.000)",
      cache: "0 ($0.000)",
      out: "0 ($0.000)",
    });
    expect(buildUsageReport({ model: "gpt-6-luna", outputTokens: 100 }).pricing.output_tokens).toBe(
      100,
    );
  });
});
