import { expect, test } from "@jest/globals";
import { addLongContextWarning, JUMBO_WARNING } from "../src/usage-report-warning.mjs";

test("adds a warning only for long-context pricing", () => {
  expect(addLongContextWarning({}, { long_context: true })).toEqual({ warning: JUMBO_WARNING });
  expect(addLongContextWarning({}, { long_context: false })).toEqual({});
});
