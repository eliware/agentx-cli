import { expect, test } from "@jest/globals";
import "../../test-fixtures/agent/runtime-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../../src/agent/runtime.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
