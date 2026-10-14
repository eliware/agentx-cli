import { describe, expect, jest, test } from "@jest/globals";
import { EventEmitter } from "node:events";
import { buildChoiceEntries, matchChoice, selectChoice } from "../src/setup-choice.mjs";

class Terminal extends EventEmitter {
  setRawMode() {}
  resume() {}
  pause() {}
}

describe("setup setting choice", () => {
  test("builds entries and marks the current value", () => {
    expect(buildChoiceEntries(["one", "two"], "two")).toEqual([
      { id: "one", label: "one" },
      { id: "two", label: "two (current)" },
    ]);
  });

  test("matches indexes, exact values, and prefixes", () => {
    const entries = buildChoiceEntries(["one", "two"], "");
    expect(matchChoice(entries, "2")).toBe("two");
    expect(matchChoice(entries, "one")).toBe("one");
    expect(matchChoice(entries, "tw")).toBe("two");
    expect(matchChoice(entries, "Two")).toBe("two");
    expect(matchChoice(entries, "nope")).toBeNull();
  });

  test("rejects an out-of-range numeric choice", () => {
    expect(matchChoice(buildChoiceEntries(["one"], ""), "2")).toBeNull();
  });

  test("selects through the raw menu and readline fallback", async () => {
    const input = new Terminal();
    const stdout = { write: jest.fn() };
    const raw = selectChoice(input, stdout, {}, "Model", ["one", "two"], "two");
    setImmediate(() => input.emit("data", Buffer.from("\r")));
    await expect(raw).resolves.toBe("two");
    await expect(
      selectChoice({}, stdout, { question: async () => "2" }, "Model", ["one", "two"], "one"),
    ).resolves.toBe("two");
    const fallbackInput = new Terminal();
    const first = selectChoice(fallbackInput, stdout, {}, "Model", ["one", "two"], "missing");
    setImmediate(() => fallbackInput.emit("data", Buffer.from("\r")));
    await expect(first).resolves.toBe("one");
  });
});
