import { describe, expect, test } from "@jest/globals";
import { normalizeTerminationOutcome } from "../src/shell-termination-outcome.mjs";

describe("shell termination outcomes", () => {
  test("maps timeout, signal, and exit states", () => {
    expect(normalizeTerminationOutcome()).toEqual({ type: "exit", exit_code: 1 });
    expect(normalizeTerminationOutcome({ timedOut: true })).toEqual({ type: "timeout" });
    expect(normalizeTerminationOutcome({ interrupted: true, code: 4 })).toEqual({
      type: "timeout",
    });
    expect(normalizeTerminationOutcome({ signal: "SIGTERM", code: 4 })).toEqual({
      type: "exit",
      exit_code: 1,
    });
    expect(normalizeTerminationOutcome({ code: 3 })).toEqual({ type: "exit", exit_code: 3 });
    expect(normalizeTerminationOutcome({ code: Number.NaN })).toEqual({
      type: "exit",
      exit_code: 1,
    });
  });
});
