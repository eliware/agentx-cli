import { expect, test } from "@jest/globals";
import { formatWebSearchCompletion } from "../../src/agent-turn/web-search-completion-format.mjs";

test("formats filtered queries and source URLs", () => {
  const line = formatWebSearchCompletion({
    action: { queries: ["q", "", 2], sources: [{ url: "https://x.test" }, "plain", ""] },
  });
  expect(line).toContain('"queries": [\n    "q",\n    "2"');
  expect(line).toContain("https://x.test");
  expect(line).toContain("plain");
});

test("returns no completion text when queries and sources are absent", () => {
  expect(formatWebSearchCompletion({ action: {} })).toBe("");
  expect(formatWebSearchCompletion({})).toBe("");
});
