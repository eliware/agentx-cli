import { expect, test } from "@jest/globals";
import { resolveSessionConfirmationChoice } from "../../src/agent/session-confirmation-choice.mjs";

test.each([
  [" y ", "approve"],
  ["YES", "approve"],
  ["n", "decline"],
  [null, "decline"],
  ["unknown", "decline"],
  ["S", "session"],
  ["session", "session"],
  ["G", "global"],
  ["global", "global"],
])("maps confirmation answer %j to %s", (answer, choice) => {
  expect(resolveSessionConfirmationChoice(answer)).toBe(choice);
});
