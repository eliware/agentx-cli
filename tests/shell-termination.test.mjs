import { expect, test } from "@jest/globals";
import { normalizeTerminationOutcome } from "../src/shell-termination.mjs";

test("maps timeout and process exit state to shell outcomes", () => {
  expect(normalizeTerminationOutcome({ timedOut: true })).toEqual({ type: "timeout" });
  expect(normalizeTerminationOutcome({ code: 3 })).toEqual({ type: "exit", exit_code: 3 });
});
