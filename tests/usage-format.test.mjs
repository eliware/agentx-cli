import { describe, expect, test } from "@jest/globals";
import {
  formatMoney,
  formatTokenCost,
  formatTokenCount,
  formatUsageJson,
} from "../src/usage-format.mjs";

describe("usage formatting", () => {
  test("formats positive and negative money", () => {
    expect(formatMoney(1_500_000n)).toBe("$0.002");
    expect(formatMoney(-1_500_000n)).toBe("$-0.002");
  });

  test("formats token counts and costs", () => {
    expect(formatTokenCount("1200")).toBe("1,200");
    expect(formatTokenCost(2, 500_000_000n)).toBe("2 ($1.000)");
  });

  test("restores escaped terminal codes in usage JSON", () => {
    expect(formatUsageJson({ warning: "\u001b[31m" })).toBe('{"warning":"\u001b[31m"}');
  });
});
