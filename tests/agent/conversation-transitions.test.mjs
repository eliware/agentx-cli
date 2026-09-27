import { describe, expect, jest, test } from "@jest/globals";
import {
  applyResponseSnapshot,
  applyRollbackSelection,
  restoreSessionState,
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
  test("restores normalized saved state without restoring a prior goal", () => {
    const savedState = {
      response_id: "saved-response",
      usage: { inputTokens: "4", cachedTokens: null, outputTokens: 3, turns: 2 },
      last_user_message: "saved question",
      last_assistant_message: "saved answer",
      pending_cli_transcript: "! ls\nfile.txt",
      pending_tool_calls: [{ call_id: "pending" }],
      execution_journal: [{ identity: "pending", status: "started" }],
      history: [{ response_id: "saved-response" }],
      rollback_backup: [{ response_id: "discarded" }],
      failed_response: true,
      pending_retry_request: { input: "tool output" },
      pending_transaction: { base_response_id: "saved-response" },
      goal: { text: "old goal", status: "active" },
    };

    expect(restoreSessionState(savedState, () => ({}))).toEqual({
      previousResponseId: "saved-response",
      lastUserMessage: "saved question",
      lastAssistantMessage: "saved answer",
      pendingCliTranscript: "! ls\nfile.txt",
      sessionUsage: { inputTokens: 4, cachedTokens: 0, outputTokens: 3, turns: 2 },
      pendingToolCalls: savedState.pending_tool_calls,
      executionJournal: savedState.execution_journal,
      history: savedState.history,
      rollbackBackup: savedState.rollback_backup,
      failedResponse: true,
      pendingRetryRequest: savedState.pending_retry_request,
      pendingTransaction: savedState.pending_transaction,
      hasPendingTransaction: true,
      activeGoal: null,
    });
  });

  test("resumes from the last successful checkpoint after a failed request", () => {
    const result = restoreSessionState(
      {
        response_id: "failed-response",
        failed_response: true,
        history: [{ response_id: "successful-response" }],
      },
      () => ({ inputTokens: 0 }),
    );
    expect(result.previousResponseId).toBe("successful-response");
    expect(result.hasPendingTransaction).toBe(false);

    const noHistory = restoreSessionState(
      { response_id: "failed", failed_response: true, history: [], usage: {} },
      () => ({}),
    );
    expect(noHistory.previousResponseId).toBe("");
    expect(noHistory.sessionUsage).toEqual({
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      turns: 0,
    });
  });

  test("uses defaults for a missing state and malformed collections", () => {
    const createUsageTotals = jest.fn(() => ({ inputTokens: 0, turns: 0 }));
    expect(restoreSessionState(null, createUsageTotals)).toEqual({
      previousResponseId: "",
      lastUserMessage: "",
      lastAssistantMessage: "",
      pendingCliTranscript: "",
      sessionUsage: { inputTokens: 0, turns: 0 },
      pendingToolCalls: [],
      executionJournal: [],
      history: [],
      rollbackBackup: [],
      failedResponse: false,
      pendingRetryRequest: null,
      pendingTransaction: null,
      hasPendingTransaction: false,
      activeGoal: null,
    });
    expect(createUsageTotals).toHaveBeenCalledTimes(1);

    const malformed = restoreSessionState(
      {
        response_id: "state",
        pending_tool_calls: {},
        execution_journal: null,
        history: "not-an-array",
        rollback_backup: {},
      },
      () => ({}),
    );
    expect(malformed).toMatchObject({
      previousResponseId: "state",
      pendingToolCalls: [],
      executionJournal: [],
      history: [],
      rollbackBackup: [],
    });
  });

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

  test("restores a selected checkpoint and clears all pending session work", () => {
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
      ...baseState,
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

  test("rejects a checkpoint that is no longer in session history", () => {
    expect(() => applyRollbackSelection(baseState, { response_id: "missing" })).toThrow(
      "Selected rollback checkpoint is no longer available.",
    );
    expect(() => applyRollbackSelection({ ...baseState, history: undefined }, {})).toThrow(
      "Selected rollback checkpoint is no longer available.",
    );
  });

  test("defaults absent checkpoint messages and usage to empty values", () => {
    const selected = { response_id: "minimal" };
    const result = applyRollbackSelection({ ...baseState, history: [selected] }, selected);
    expect(result).toMatchObject({
      response_id: "minimal",
      last_user_message: "",
      last_assistant_message: "",
      usage: {},
      history: [selected],
      rollback_backup: [],
    });
  });
});
