import { expect, test } from "@jest/globals";
import { makeShellCommandOutput, truncateShellText } from "../src/shell-output.mjs";

test("truncates shell output and appends a marker", () => {
  expect(truncateShellText("abcdefgh", 5)).toBe("abcde");
  expect(makeShellCommandOutput({ stdout: "ok", outcome: { type: "exit" } })).toMatchObject({
    stdout: "ok",
    outcome: { type: "exit" },
  });
});
