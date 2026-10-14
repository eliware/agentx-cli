import { expect, test } from "@jest/globals";
import "../test-fixtures/conversation-state-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../src/conversation-state.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
