import { describe, expect, jest, test } from "@jest/globals";
import { EventEmitter } from "node:events";
import { selectChoice } from "../src/setup-choice.mjs";

class Terminal extends EventEmitter {
  setRawMode() {}
  resume() {}
  pause() {}
}

describe("setup setting choice", () => {
  test("uses readline input and selects a default after an invalid raw key", async () => {
    const stdout = { write: jest.fn() };
    await expect(
      selectChoice({}, stdout, { question: async () => "2" }, "Model", ["one", "two"], "one"),
    ).resolves.toBe("two");
    const fallbackInput = new Terminal();
    const first = selectChoice(fallbackInput, stdout, {}, "Model", ["one", "two"], "missing");
    setImmediate(() => fallbackInput.emit("data", Buffer.from("\r")));
    await expect(first).resolves.toBe("one");
  });
});
