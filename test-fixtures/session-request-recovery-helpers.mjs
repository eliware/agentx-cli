import { jest } from "@jest/globals";

export function setup(resolveSessionRequestFailure, overrides = {}) {
  const state = {
    openai: "old-client",
    previousResponseId: "response-1",
    retryRequest: null,
    pendingRetryRequest: { input: ["retry"] },
    pendingTransaction: { request: { input: ["retry"] } },
    pendingToolCalls: [{ call_id: "tool-1" }],
    executionJournal: [{ identity: "tool-1", status: "started" }],
    failedResponse: false,
    recoveryAttempts: 0,
    websocketRecoveryAttempts: 0,
    websocketRecoveryStartedAt: null,
    debugEnabled: false,
    clearPendingContinuationForNewChain() {
      this.previousResponseId = "";
      this.retryRequest = null;
      this.pendingRetryRequest = null;
      this.pendingTransaction = null;
      this.pendingToolCalls = [];
      this.executionJournal = [];
      this.failedResponse = false;
    },
  };
  const deps = {
    isWebsocketRecoveryError: jest.fn(() => false),
    waitForWebsocketRetry: jest.fn(async () => false),
    decideRequestFailure: jest.fn(() => ({ action: "menu", recoveryAttempts: 1 })),
    recreateOpenAIClient: jest.fn(async () => "new-client"),
    setActiveOpenAI: jest.fn(),
    writeSystem: jest.fn(),
    writeDebugEnabled: jest.fn(),
    saveState: jest.fn(),
    promptRecoveryMenu: jest.fn(async () => "retry"),
    terminalInput: { setRawMode: jest.fn(), resume: jest.fn() },
    preserveReplHistory: jest.fn(),
    closeReadline: jest.fn(),
    createReadline: jest.fn(() => "new-readline"),
    setReadline: jest.fn(),
    decideRecoveryMenuChoice: jest.fn((choice) => ({ action: choice, recoveryAttempts: 2 })),
    bindDebugListeners: jest.fn(),
    promptRollback: jest.fn(async () => null),
    applyRollback: jest.fn(),
    persistCheckpoint: jest.fn(),
    resetState: jest.fn(),
    createUsageTotals: jest.fn(() => "empty-usage"),
    clearSession: jest.fn(),
    ...overrides,
  };
  const resolve = (error, options = {}) =>
    resolveSessionRequestFailure({ error, state, oneShot: false, history: [], ...options, deps });
  return { state, deps, resolve };
}
