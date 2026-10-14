import { expect, test } from "@jest/globals";
import "../../test-fixtures/agent-turn/status-controller-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../../src/agent-turn/status-controller.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
