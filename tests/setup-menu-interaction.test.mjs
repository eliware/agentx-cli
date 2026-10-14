import { describe, expect, jest, test } from "@jest/globals";
import { EventEmitter } from "node:events";
import {
  buildChoiceEntries,
  matchChoice,
  selectSetupMenuChoice,
} from "../src/setup-menu-interaction.mjs";

describe("setup readline menu interaction", () => {
  const entries = [
    { id: "model", label: "Model" },
    { id: "quit", label: "Quit" },
  ];

  test("builds and matches choice entries", () => {
    const choices = buildChoiceEntries(["one", "two"], "two");
    expect(choices).toEqual([
      { id: "one", label: "one" },
      { id: "two", label: "two (current)" },
    ]);
    expect(matchChoice(choices, "2")).toBe("two");
    expect(matchChoice(choices, "one")).toBe("one");
    expect(matchChoice(choices, "tw")).toBe("two");
    expect(matchChoice(choices, "Two")).toBe("two");
    expect(matchChoice(choices, "nope")).toBeNull();
    expect(matchChoice(buildChoiceEntries(["one"], ""), "2")).toBeNull();
  });

  test("uses raw selection before the readline fallback", async () => {
    const rawInput = new EventEmitter();
    rawInput.setRawMode = () => {};
    rawInput.resume = () => {};
    const rawChoice = selectSetupMenuChoice({
      stdin: rawInput,
      stdout: { write: jest.fn() },
      entries,
      initialIndex: 0,
      paths: {},
      readline: { question: jest.fn() },
      fallbackScreen: jest.fn(),
    });
    setImmediate(() => rawInput.emit("data", Buffer.from("\r")));
    await expect(rawChoice).resolves.toBe(entries[0]);
  });

  test("renders the fallback screen before readline input", async () => {
    const fallbackScreen = jest.fn();
    const readline = { question: jest.fn(async () => "2") };
    await expect(
      selectSetupMenuChoice({
        stdin: {},
        stdout: {},
        entries,
        initialIndex: 0,
        paths: {},
        readline,
        fallbackScreen,
      }),
    ).resolves.toBe(entries[1]);
    expect(fallbackScreen).toHaveBeenCalledTimes(1);
  });
});
