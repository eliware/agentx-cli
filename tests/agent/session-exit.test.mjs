import { describe, expect, jest, test } from "@jest/globals";
import { exitSessionWithSummary } from "../../src/agent/session-exit.mjs";

describe("session exit action", () => {
  test("prints the final report, closes readline, and exits successfully in order", () => {
    const events = [];
    const readline = { close: jest.fn(() => events.push("close")) };
    const printUsageReport = jest.fn((usage, options) => events.push(["report", usage, options]));
    const exit = jest.fn((code) => events.push(["exit", code]));

    exitSessionWithSummary({
      noUsage: false,
      usage: { turns: 1 },
      model: "test-model",
      leadingNewline: true,
      readline,
      printUsageReport,
      exit,
    });

    expect(events).toEqual([
      ["report", { turns: 1 }, { leadingNewline: true, model: "test-model" }],
      "close",
      ["exit", 0],
    ]);
  });

  test("skips a suppressed report and tolerates absent readline methods", () => {
    const printUsageReport = jest.fn();
    const exit = jest.fn();
    exitSessionWithSummary({
      noUsage: true,
      usage: {},
      readline: {},
      printUsageReport,
      exit,
    });
    expect(printUsageReport).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });
});
