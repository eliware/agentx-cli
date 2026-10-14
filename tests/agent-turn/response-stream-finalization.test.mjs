import { describe, expect, test } from "@jest/globals";
import { finalizeStreamOutput } from "../../src/agent-turn/response-stream-finalization.mjs";

describe("response stream finalization", () => {
  test("flushes text and adds reset and newline only when needed", () => {
    const writes = [];
    const original = process.stdout.write;
    process.stdout.write = (value) => (writes.push(String(value)), true);
    try {
      const live = {
        sawOutput: () => true,
        flushTextDelta: () => writes.push("flush"),
        streamedText: () => "hello",
      };
      finalizeStreamOutput(live, true);
      expect(writes).toEqual(["flush", "\u001b[0m", "\n"]);
    } finally {
      process.stdout.write = original;
    }
  });

  test("does nothing without output and omits reset when colors are off", () => {
    const writes = [];
    const original = process.stdout.write;
    process.stdout.write = (value) => (writes.push(String(value)), true);
    try {
      finalizeStreamOutput({ sawOutput: () => false }, true);
      finalizeStreamOutput(
        { sawOutput: () => true, flushTextDelta() {}, streamedText: () => "done\n" },
        false,
      );
      expect(writes).toEqual([]);
    } finally {
      process.stdout.write = original;
    }
  });
});
