import { describe, expect, test } from "@jest/globals";
import {
  applyRecoveryMenuState,
  applyRequestFailureState,
  clearPendingContinuationForNewChain,
} from "../../src/agent/session-recovery-state.mjs";

describe("session recovery state", () => {
  test("applies request failure and menu attempt transitions", () => {
    const state = {
      recoveryAttempts: 0,
      newChainAttempts: 1,
      pendingToolCalls: ["call"],
      pendingTransaction: null,
    };
    applyRequestFailureState(state, { recoveryAttempts: 2 });
    expect(state).toMatchObject({
      recoveryAttempts: 2,
      failedResponse: true,
      pendingToolCalls: [],
    });
    applyRecoveryMenuState(state, { recoveryAttempts: 3, newChainAttempts: 4 });
    expect(state).toMatchObject({ recoveryAttempts: 3, newChainAttempts: 4 });
    applyRecoveryMenuState(state, { recoveryAttempts: 5 });
    expect(state.newChainAttempts).toBe(4);
  });

  test("clears pending continuation state when a new chain starts", () => {
    const state = {
      previousResponseId: "response",
      retryRequest: { retry: true },
      pendingRetryRequest: { request: true },
      pendingTransaction: { request: true },
      pendingToolCalls: [{ id: "call" }],
      executionJournal: [{ id: "call" }],
      failedResponse: true,
    };
    clearPendingContinuationForNewChain(state);
    expect(state).toEqual({
      previousResponseId: "",
      retryRequest: null,
      pendingRetryRequest: null,
      pendingTransaction: null,
      pendingToolCalls: [],
      executionJournal: [],
      failedResponse: false,
    });
  });
});
