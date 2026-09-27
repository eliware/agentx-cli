import { describe, expect, test } from "@jest/globals";
import { normalizeUsage, numericValue, stripAnsi } from "../src/usage-normalization.mjs";

describe("usage normalization", () => {
  test("strips ANSI sequences and coerces finite numeric values", () => {
    expect(stripAnsi("\u001b[33m1,234\u001b[0m")).toBe("1,234");
    expect(stripAnsi(null)).toBe("");
    expect(numericValue("\u001b[32m100\u001b[0m")).toBe(100);
    expect(numericValue("bad")).toBe(0);
    expect(numericValue(undefined)).toBe(0);
  });

  test("normalizes provider token counts and includes nonzero optional fields", () => {
    expect(normalizeUsage()).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(
      normalizeUsage({
        inputTokens: "\u001b[32m100\u001b[0m",
        cachedTokens: 40,
        cacheWriteTokens: 20,
        outputTokens: 12,
        reasoningTokens: 3,
      }),
    ).toEqual({
      inputTokens: 60,
      cachedTokens: 40,
      cacheWriteTokens: 20,
      outputTokens: 12,
      reasoningTokens: 3,
    });
    expect(normalizeUsage({ inputTokens: 2, cachedTokens: 9, outputTokens: "bad" })).toEqual({
      inputTokens: 0,
      cachedTokens: 9,
      outputTokens: 0,
    });
    expect(normalizeUsage({ cacheWriteTokens: 0, reasoningTokens: 0 })).toEqual({
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
    });
  });
});
