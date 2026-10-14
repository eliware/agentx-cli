import { expect, test } from "@jest/globals";
import { makeShellCommandOutput, truncateShellText } from "../src/shell-output.mjs";

test("truncates shell output and appends a marker", () => {
  expect(truncateShellText("abcdefgh", 5)).toBe("abcde");
  expect(makeShellCommandOutput({ stdout: "ok", outcome: { type: "exit" } })).toMatchObject({
    stdout: "ok",
    outcome: { type: "exit" },
  });
});

test("handles normal output and limits shorter than the truncation note", () => {
  expect(truncateShellText("short", 5)).toBe("short");
  expect(truncateShellText("long", 3)).toBe("lon");
  expect(truncateShellText("x".repeat(40), 30)).toBe(`${"x".repeat(11)}\n[output truncated]`);
  expect(truncateShellText("long", 20)).toBe("long");
  expect(makeShellCommandOutput({ stderr: "", outcome: { type: "exit" } })).toMatchObject({
    stdout: "",
    stderr: "",
  });
});
