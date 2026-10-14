import { expect, test } from "@jest/globals";
import "../test-fixtures/resume-menu-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../src/resume-menu.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
