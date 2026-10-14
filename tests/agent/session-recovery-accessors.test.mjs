import { expect, jest, test } from "@jest/globals";
import { createRecoveryState } from "../../src/agent/session-recovery-accessors.mjs";

test("reads and writes recovery values through session accessors", () => {
  const values = {};
  const session = {};
  for (const name of [
    "OpenAI",
    "PreviousResponseId",
    "PendingRetryRequest",
    "PendingTransaction",
    "PendingToolCalls",
    "ExecutionJournal",
    "FailedResponse",
    "DebugEnabled",
  ]) {
    session[`get${name}`] = jest.fn(() => values[name]);
    session[`set${name}`] = jest.fn((value) => {
      values[name] = value;
    });
  }
  const state = createRecoveryState(session);
  for (const key of [
    "openai",
    "previousResponseId",
    "pendingRetryRequest",
    "pendingTransaction",
    "pendingToolCalls",
    "executionJournal",
    "failedResponse",
    "debugEnabled",
  ]) {
    state[key] = key;
    expect(state[key]).toBe(key);
  }
  state.retryRequest = "retry";
  state.recoveryAttempts = 1;
  state.newChainAttempts = 2;
  state.websocketRecoveryAttempts = 2;
  state.websocketRecoveryStartedAt = 3;
  expect([
    state.retryRequest,
    state.recoveryAttempts,
    state.newChainAttempts,
    state.websocketRecoveryAttempts,
    state.websocketRecoveryStartedAt,
  ]).toEqual(["retry", 1, 2, 2, 3]);
  state.clearPendingContinuationForNewChain();
  expect(state.previousResponseId).toBe("");
  expect(state.pendingTransaction).toBeNull();
  expect(state.pendingToolCalls).toEqual([]);
  expect(state.executionJournal).toEqual([]);
  expect(state.failedResponse).toBe(false);
  expect(state.retryRequest).toBeNull();
});
