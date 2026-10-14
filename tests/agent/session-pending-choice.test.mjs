import { expect, test } from "@jest/globals";
import { resolvePendingSessionChoice } from "../../src/agent/session-pending-choice.mjs";

test.each([
  ["new-session", { action: "abandon" }],
  ["auto-resume", { action: "resume", notice: "Resuming pending tool execution" }],
  [
    "interrupt-retry",
    { action: "resume", notice: "Resuming pending tool execution with retry hint" },
  ],
  [
    "other",
    { action: "resume", notice: "Resuming pending tool execution with interruption notice" },
  ],
])("maps the %s choice to its action and notice", (choice, expected) => {
  expect(resolvePendingSessionChoice(choice)).toEqual(expected);
});
