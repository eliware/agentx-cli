import { describe, expect, test } from "@jest/globals";
import { finalizeStreamOutput } from "../../src/agent-turn/response-stream-finalization.mjs";

describe("response stream finalization", () => {
  test.each([
    [true, true, "hello", ["flush", "\u001b[0m", "\n"]],
    [false, true, "", []],
    [true, false, "done\n", ["flush"]],
  ])("finalizes output state %j", (sawOutput, colors, text, expected) => {
    const writes = [];
    const original = process.stdout.write;
    process.stdout.write = (value) => (writes.push(String(value)), true);
    try {
      finalizeStreamOutput(
        {
          sawOutput: () => sawOutput,
          flushTextDelta: () => writes.push("flush"),
          streamedText: () => text,
        },
        colors,
      );
      expect(writes).toEqual(expected);
    } finally {
      process.stdout.write = original;
    }
  });
});
