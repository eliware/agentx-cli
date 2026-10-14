import { expect, test } from "@jest/globals";
import { hasInteractiveSetupTerminal } from "../src/setup-terminal-policy.mjs";

test.each([
  [{ isTTY: true }, { isTTY: true }, true],
  [{ isTTY: true }, { isTTY: false }, false],
  [{ isTTY: false }, { isTTY: true }, false],
  [null, { isTTY: true }, false],
])("checks both setup streams for TTY support", (stdin, stdout, expected) => {
  expect(hasInteractiveSetupTerminal(stdin, stdout)).toBe(expected);
});
