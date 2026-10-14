import { expect, test } from "@jest/globals";
import { normalizeUsage } from "../src/conversation-state-usage.mjs";

test("normalizes numeric usage fields and supplies defaults", () => {
  expect(
    normalizeUsage({ inputTokens: "8", cachedTokens: null, outputTokens: 2, turns: "3" }),
  ).toEqual({
    inputTokens: 8,
    cachedTokens: 0,
    outputTokens: 2,
    turns: 3,
  });
  expect(normalizeUsage()).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 });
});
