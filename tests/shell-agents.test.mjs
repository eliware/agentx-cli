import { expect, test } from "@jest/globals";
import "../test-fixtures/shell-agents-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../src/shell-agents.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
