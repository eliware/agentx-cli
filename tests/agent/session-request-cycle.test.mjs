import { expect, test } from "@jest/globals";
import "../../test-fixtures/agent/session-request-cycle-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../../src/agent/session-request-cycle.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
