import { expect, test } from "@jest/globals";
import { basename } from "node:path";
import { promptPath } from "../src/runtime.mjs";

test("resolves the package prompt file", () => {
  expect(basename(promptPath)).toBe("prompt.json");
});
