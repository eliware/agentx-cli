import { expect, test } from "@jest/globals";
import { normalizeStatusValue } from "../../src/agent-turn/status-value-format.mjs";

test("normalizes status objects, labels, ANSI text, and non-string values", () => {
  expect(normalizeStatusValue({ value: "ready" })).toBe("ready");
  expect(normalizeStatusValue({ value: null })).toBe("");
  expect(normalizeStatusValue("reasoning: \u001b[31mthinking\u001b[0m")).toBe("thinking");
  expect(normalizeStatusValue(7)).toBe("7");
  expect(normalizeStatusValue(null)).toBe("");
});
