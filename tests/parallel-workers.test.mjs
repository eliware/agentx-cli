import { expect, test } from "@jest/globals";
import "../test-fixtures/parallel-workers-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../src/parallel-workers.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
