import { expect, test } from "@jest/globals";
import "../test-fixtures/worker-registry-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../src/worker-registry.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
