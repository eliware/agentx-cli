import { expect, test } from "@jest/globals";
import "../../test-fixtures/agent-turn/tool-call-runner-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../../src/agent-turn/tool-call-runner.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
