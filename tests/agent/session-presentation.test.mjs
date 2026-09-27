import { describe, expect, jest, test } from "@jest/globals";
import { presentAgentSession } from "../../src/agent/session-presentation.mjs";

function render(overrides = {}) {
  const writes = [];
  const printResumeMessage = jest.fn();
  const options = {
    outputFlags: { quiet: false },
    savedState: {},
    savedResponseId: "",
    restoredSession: { hasPendingTransaction: false, activeGoal: null },
    agentsText: "instructions",
    oneShot: false,
    settings: "settings",
    formatSystemMessage: (message) => `[${message}]`,
    write: (text) => writes.push(text),
    printResumeMessage,
    ...overrides,
  };
  presentAgentSession(options);
  return { writes, printResumeMessage };
}

describe("session presentation", () => {
  test("renders startup, resumed-session, and saved-message notices in order", () => {
    const { writes, printResumeMessage } = render({
      savedState: { last_user_message: "hello", last_assistant_message: "hi" },
      savedResponseId: "resp-1",
    });
    expect(writes).toEqual(["settings\n", "[Resuming conversation resp-1]\n"]);
    expect(printResumeMessage.mock.calls).toEqual([
      ["Last user message", "hello"],
      ["Last assistant message", "hi"],
    ]);
  });

  test("explains missing instructions, new sessions, and one-shot checkpoint branches", () => {
    const missingAgents = render({ agentsText: "" });
    expect(missingAgents.writes).toEqual([
      "settings\n",
      "[AGENTS.md not found; ask AgentX to generate one for this project.]\n",
      "[Starting new session]\n",
    ]);
    const oneShot = render({ oneShot: true, savedResponseId: "resp-2" });
    expect(oneShot.writes).toEqual(["settings\n", "[Branching from checkpoint resp-2]\n"]);
    expect(oneShot.printResumeMessage).not.toHaveBeenCalled();
  });

  test("renders recovery and paused-goal notices with their applicable session state", () => {
    const pending = render({
      savedState: { failed_response: true },
      restoredSession: {
        hasPendingTransaction: true,
        activeGoal: { status: "paused", text: "ship" },
      },
    });
    expect(pending.writes.slice(-2)).toEqual([
      "[Previous continuation failed; pending tool transaction preserved for recovery.]\n",
      "[Paused goal: ship. Use /goal resume to continue.]\n",
    ]);

    const failed = render({
      savedState: { failed_response: true },
      restoredSession: { hasPendingTransaction: false, activeGoal: null },
    });
    expect(failed.writes.at(-1)).toBe(
      "[Previous request failed; starting from the last successful checkpoint.]\n",
    );
  });

  test("quiet mode suppresses startup notices and one-shot mode suppresses paused goals", () => {
    const quiet = render({
      outputFlags: { quiet: true },
      savedState: { failed_response: true },
      restoredSession: {
        hasPendingTransaction: false,
        activeGoal: { status: "paused", text: "ship" },
      },
    });
    expect(quiet.writes).toEqual([
      "[Previous request failed; starting from the last successful checkpoint.]\n",
      "[Paused goal: ship. Use /goal resume to continue.]\n",
    ]);

    const oneShot = render({
      oneShot: true,
      restoredSession: {
        hasPendingTransaction: false,
        activeGoal: { status: "paused", text: "ship" },
      },
    });
    expect(oneShot.writes).not.toContain("[Paused goal: ship. Use /goal resume to continue.]\n");
  });
});
