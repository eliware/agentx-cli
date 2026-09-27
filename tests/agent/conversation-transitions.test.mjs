import { describe, expect, test } from "@jest/globals";
import {
  applyResponseSnapshot,
  resetSessionState,
} from "../../src/agent/conversation-transitions.mjs";

const baseState = {
  response_id: "old-response",
  usage: { input_tokens: 3 },
  last_user_message: "a user message longer than twenty characters",
  last_assistant_message: "previous answer",
  pending_tool_calls: [],
  execution_journal: [{ identity: "tool-1", status: "started" }],
  history: [{ response_id: "old-response" }],
  failed_response: true,
  pending_retry_request: { input: "retry" },
  pending_transaction: { base_response_id: "old-response" },
};

describe("agent response snapshot transitions", () => {
  test("stores pending tool calls without marking the response successful", () => {
    const calls = [{ call_id: "call-1" }];
    const result = applyResponseSnapshot(
      baseState,
      { response: { id: "pending-response" }, pendingToolCalls: calls },
      { timestamp: "now" },
    );

    expect(result).toEqual({
      state: {
        ...baseState,
        response_id: "pending-response",
        pending_tool_calls: calls,
        pending_transaction: {
          base_response_id: "pending-response",
          calls,
          request: null,
          execution_journal: baseState.execution_journal,
        },
      },
      checkpoint: null,
    });
  });

  test("records successful history, clears retry state, and returns a shared checkpoint", () => {
    const { state, checkpoint } = applyResponseSnapshot(
      baseState,
      { response: { id: "new-response" }, pendingToolCalls: [] },
      { assistantText: "answer text", timestamp: "fixed-time" },
    );

    expect(state).toMatchObject({
      response_id: "new-response",
      pending_tool_calls: [],
      failed_response: false,
      pending_retry_request: null,
      pending_transaction: null,
      last_assistant_message: "answer text",
      history: [
        { response_id: "old-response" },
        {
          response_id: "new-response",
          timestamp: "fixed-time",
          user_preview: "a user message longe",
          assistant_preview: "answer text",
          usage: { input_tokens: 3 },
          last_user_message: baseState.last_user_message,
          last_assistant_message: "answer text",
        },
      ],
    });
    expect(checkpoint).toMatchObject({ response_id: "new-response", history: state.history });
  });

  test("replaces duplicate history entries and respects one-shot isolation", () => {
    const state = {
      ...baseState,
      history: [{ response_id: "same" }, { response_id: "keep" }, { response_id: "same" }],
    };
    const result = applyResponseSnapshot(
      state,
      { response: { id: "same" } },
      { assistantText: "done", timestamp: "later", oneShot: true },
    );

    expect(result.state.history.map((entry) => entry.response_id)).toEqual(["keep", "same"]);
    expect(result.checkpoint).toBeNull();
  });

  test("preserves response state when no response id is supplied", () => {
    const result = applyResponseSnapshot(baseState, { response: {}, pendingToolCalls: "invalid" });
    expect(result.state).toMatchObject({
      response_id: "old-response",
      pending_tool_calls: [],
      pending_transaction: baseState.pending_transaction,
      last_assistant_message: baseState.last_assistant_message,
    });
    expect(result.checkpoint).toBeNull();
  });

  test("starts a fresh successful history when there is no prior history", () => {
    const state = { ...baseState, history: undefined, last_user_message: "hello" };
    const result = applyResponseSnapshot(state, { response: { id: "first" } });

    expect(result.state.history).toHaveLength(1);
    expect(result.state.history[0]).toMatchObject({
      response_id: "first",
      user_preview: "hello",
      assistant_preview: "",
    });
    expect(result.checkpoint.response_id).toBe("first");
  });

  test("clears every persisted field while installing fresh usage totals", () => {
    const emptyUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 };
    expect(resetSessionState(baseState, emptyUsage)).toEqual({
      ...baseState,
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
});
