import { describe, expect, test } from "@jest/globals";
import { applyRollbackSelection } from "../../src/agent/rollback-transition.mjs";

describe("rollback state transition", () => {
  test("restores a selected checkpoint and removes pending work", () => {
    const older = {
      response_id: "older",
      last_user_message: "older question",
      last_assistant_message: "older answer",
      usage: { input_tokens: 2 },
    };
    const selected = {
      response_id: "selected",
      last_user_message: "selected question",
      last_assistant_message: "selected answer",
      usage: { input_tokens: 5 },
    };
    const newer = { response_id: "newer" };
    const state = {
      response_id: "old-response",
      usage: { input_tokens: 3 },
      last_user_message: "a user message",
      last_assistant_message: "previous answer",
      pending_cli_transcript: "pending shell output",
      pending_tool_calls: [{ call_id: "pending-call" }],
      execution_journal: [{ identity: "pending-call", status: "started" }],
      pending_retry_request: { input: "retry" },
      pending_transaction: { base_response_id: "pending" },
      failed_response: true,
      goal: { status: "active" },
      history: [older, selected, newer],
    };

    expect(applyRollbackSelection(state, selected)).toEqual({
      ...state,
      response_id: "selected",
      last_user_message: "selected question",
      last_assistant_message: "selected answer",
      usage: { input_tokens: 5 },
      pending_cli_transcript: "",
      pending_tool_calls: [],
      execution_journal: [],
      pending_retry_request: null,
      pending_transaction: null,
      failed_response: false,
      goal: null,
      rollback_backup: [newer],
      history: [older, selected],
    });
  });

  test("rejects a checkpoint that is not in the history", () => {
    expect(() =>
      applyRollbackSelection({ history: [{ response_id: "current" }] }, { response_id: "missing" }),
    ).toThrow("Selected rollback checkpoint is no longer available.");
    expect(() => applyRollbackSelection({ history: undefined }, {})).toThrow(
      "Selected rollback checkpoint is no longer available.",
    );
  });

  test("defaults missing selected messages and usage", () => {
    const selected = { response_id: "minimal" };
    expect(applyRollbackSelection({ history: [selected] }, selected)).toEqual({
      response_id: "minimal",
      last_user_message: "",
      last_assistant_message: "",
      usage: {},
      pending_cli_transcript: "",
      pending_tool_calls: [],
      execution_journal: [],
      pending_retry_request: null,
      pending_transaction: null,
      failed_response: false,
      goal: null,
      rollback_backup: [],
      history: [selected],
    });
  });
});
