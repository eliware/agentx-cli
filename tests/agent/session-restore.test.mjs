import { describe, expect, jest, test } from "@jest/globals";
import { restoreSessionState } from "../../src/agent/session-restore.mjs";

describe("session restore", () => {
  test("restores saved fields but never restores an earlier goal", () => {
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

  test("uses the last successful checkpoint after a failed request", () => {
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

  test("uses fresh usage defaults and normalizes malformed collections", () => {
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
});
