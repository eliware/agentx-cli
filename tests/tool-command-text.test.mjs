import { expect, test } from "@jest/globals";
import { toolCommandText } from "../src/tool-command-text.mjs";

test("normalizes command strings and lists for policy checks", () => {
  expect(toolCommandText({ action: { commands: [" Touch file ", null] } })).toBe("touch file  &&");
  expect(toolCommandText({ action: { commands: "  LS -la " } })).toBe("ls -la");
  expect(toolCommandText({ action: { commands: 42 } })).toBe("");
  expect(toolCommandText({})).toBe("");
});
