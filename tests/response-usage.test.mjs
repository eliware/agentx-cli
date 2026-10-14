import { describe, expect, test } from "@jest/globals";
import { extractUsage } from "../src/response-usage.mjs";

describe("response usage", () => {
  test("maps provider usage fields", () => {
    expect(extractUsage()).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(
      extractUsage({
        usage: { input_tokens: 17, input_tokens_details: { cached_tokens: 5 }, output_tokens: 9 },
      }),
    ).toEqual({ inputTokens: 12, cachedTokens: 5, outputTokens: 9 });
    expect(
      extractUsage({
        usage: {
          input_tokens: 20,
          input_tokens_details: { cached_tokens: 5, cache_write_tokens: 2 },
          output_tokens: 9,
          output_tokens_details: { reasoning_tokens: 3 },
        },
      }),
    ).toEqual({
      inputTokens: 15,
      cachedTokens: 5,
      cacheWriteTokens: 2,
      outputTokens: 9,
      reasoningTokens: 3,
    });
  });
});
