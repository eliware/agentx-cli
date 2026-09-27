import { describe, expect, test } from "@jest/globals";
import {
  formatElapsedStatus,
  formatTransactionCompletionMessage,
} from "../src/agent-turn/status-format.mjs";

describe("status formatting", () => {
  test("formats elapsed times with clamping, rounding, and minute rollover", () => {
    expect(formatElapsedStatus()).toBe("0s");
    expect(formatElapsedStatus(-1000)).toBe("0s");
    expect(formatElapsedStatus(1499)).toBe("1s");
    expect(formatElapsedStatus(61000)).toBe("1m 1s");
  });

  test("serializes only meaningful transaction summary fields", () => {
    expect(formatTransactionCompletionMessage()).toBe("{}");
    expect(
      formatTransactionCompletionMessage({
        time: 42,
        reasoning: { value: "1s/2s" },
        writing: "writing: \u001b[32m3s\u001b[0m",
        executing: null,
      }),
    ).toBe('{"time":"42","reasoning":"1s/2s","writing":"3s"}');
    expect(
      formatTransactionCompletionMessage({
        time: "",
        reasoning: "",
        writing: { value: undefined },
        executing: false,
      }),
    ).toBe('{"executing":"false"}');
  });
});
