import { expect, test } from "@jest/globals";
import "../../test-fixtures/agent/conversation-persistence-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../../src/agent/conversation-persistence.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
