import { expect, test } from "@jest/globals";
import { resetSessionState } from "../../src/agent/session-state-reset-transition.mjs";

test("clears persisted session state and installs fresh usage totals", () => {
  const state = {
    response_id: "old",
    usage: { turns: 2 },
    last_user_message: "question",
    last_assistant_message: "answer",
    pending_cli_transcript: "!pwd",
    pending_tool_calls: [{ id: "call" }],
    execution_journal: [{ identity: "call" }],
    history: [{ response_id: "old" }],
    rollback_backup: [{ response_id: "old" }],
    failed_response: true,
    pending_retry_request: { input: [] },
    pending_transaction: { request: {} },
    goal: { status: "active" },
  };
  const emptyUsage = { turns: 0 };
  expect(resetSessionState(state, emptyUsage)).toEqual({
    ...state,
    response_id: "",
    usage: emptyUsage,
    last_user_message: "",
    last_assistant_message: "",
    pending_cli_transcript: "",
    pending_tool_calls: [],
    execution_journal: [],
    history: [],
    rollback_backup: [],
    failed_response: false,
    pending_retry_request: null,
    pending_transaction: null,
    goal: null,
  });
});
