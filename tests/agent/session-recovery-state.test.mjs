import { describe, expect, jest, test } from "@jest/globals";
import { createRecoveryState } from "../../src/agent/session-recovery-state.mjs";

describe("session recovery state", () => {
  test("reads and writes recovery values through session accessors", () => {
    const values = {};
    const session = {};
    for (const name of [
      "OpenAI",
      "PreviousResponseId",
      "PendingRetryRequest",
      "PendingTransaction",
      "PendingToolCalls",
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
      "failedResponse",
      "debugEnabled",
    ]) {
      state[key] = key;
      expect(state[key]).toBe(key);
    }
    state.retryRequest = "retry";
    state.recoveryAttempts = 1;
    state.websocketRecoveryAttempts = 2;
    state.websocketRecoveryStartedAt = 3;
    expect([
      state.retryRequest,
      state.recoveryAttempts,
      state.websocketRecoveryAttempts,
      state.websocketRecoveryStartedAt,
    ]).toEqual(["retry", 1, 2, 3]);
  });
});
