import { describe, expect, jest, test } from "@jest/globals";
import { resolveSessionRequestFailure } from "../../src/agent/session-request-recovery.mjs";

function setup(overrides = {}) {
  const state = {
    openai: "old-client",
    previousResponseId: "response-1",
    retryRequest: null,
    pendingRetryRequest: { input: ["retry"] },
    pendingTransaction: { request: { input: ["retry"] } },
    pendingToolCalls: [{ call_id: "tool-1" }],
    failedResponse: false,
    recoveryAttempts: 0,
    websocketRecoveryAttempts: 0,
    websocketRecoveryStartedAt: null,
    debugEnabled: false,
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

describe("session request recovery flow", () => {
  test("recreates a client and retries recognized websocket failures within the retry window", async () => {
    const setupState = setup({
      isWebsocketRecoveryError: jest.fn(() => true),
      waitForWebsocketRetry: jest.fn(async () => true),
      decideRequestFailure: jest.fn(() => ({ action: "reconnect", recoveryAttempts: 0 })),
    });
    const result = await setupState.resolve(new Error("closed"), {
      createSessionClient: jest.fn(() => "fresh-client"),
      now: () => 123,
    });
    expect(result).toEqual({ control: "retry" });
    expect(setupState.state.websocketRecoveryStartedAt).toBe(123);
    expect(setupState.deps.waitForWebsocketRetry).toHaveBeenCalledWith(123, 0);
    expect(setupState.state.openai).toBe("new-client");
    expect(setupState.state.websocketRecoveryAttempts).toBe(1);
    expect(setupState.deps.setActiveOpenAI).toHaveBeenCalledWith("new-client");
    expect(setupState.deps.writeSystem).toHaveBeenCalledWith(
      "Responses connection expired; reconnecting.",
    );
  });

  test("starts a new chain after a missing prior response", async () => {
    const { state, resolve } = setup({
      decideRequestFailure: jest.fn(() => ({ action: "new-chain", recoveryAttempts: 1 })),
    });
    await expect(resolve(new Error("missing"))).resolves.toEqual({ control: "retry" });
    expect(state.previousResponseId).toBe("");
    expect(state.pendingRetryRequest).toBeNull();
    expect(state.retryRequest).toBeNull();
  });

  test("retries a one-shot pending continuation and otherwise returns the original error", async () => {
    const retry = setup({
      decideRequestFailure: jest.fn(() => ({ action: "retry-pending", recoveryAttempts: 1 })),
    });
    await expect(retry.resolve(new Error("temporary"), { oneShot: true })).resolves.toEqual({
      control: "retry",
    });
    expect(retry.state.retryRequest).toBe(retry.state.pendingRetryRequest);

    const failed = setup({
      decideRequestFailure: jest.fn(() => ({ action: "fail", recoveryAttempts: 1 })),
    });
    const error = new Error("request failed");
    await expect(failed.resolve(error, { oneShot: true })).resolves.toEqual({
      control: "throw",
      error,
    });
  });

  test("cancels a recovery menu, restores terminal/readline, and preserves session state", async () => {
    const abort = Object.assign(new Error("cancel"), { name: "AbortError" });
    const { deps, resolve } = setup({
      promptRecoveryMenu: jest.fn(async () => {
        throw abort;
      }),
    });
    await expect(resolve(new Error("failure"))).resolves.toEqual({ control: "end" });
    expect(deps.terminalInput.setRawMode).toHaveBeenCalledWith(false);
    expect(deps.terminalInput.resume).toHaveBeenCalledTimes(1);
    expect(deps.preserveReplHistory).toHaveBeenCalledTimes(1);
    expect(deps.closeReadline).toHaveBeenCalledTimes(1);
    expect(deps.setReadline).toHaveBeenCalledWith("new-readline");
    expect(deps.writeSystem).toHaveBeenCalledWith("Recovery cancelled; session preserved.");
  });

  test("defaults omitted history and clears pending calls when no transaction request exists", async () => {
    const state = setup({
      decideRequestFailure: jest.fn(() => ({ action: "fail", recoveryAttempts: 1 })),
    });
    state.state.pendingTransaction = null;
    state.deps.promptRecoveryMenu.mockRejectedValue(new Error("menu failed"));
    const error = new Error("request failed");
    await expect(
      resolveSessionRequestFailure({
        error,
        state: state.state,
        oneShot: false,
        deps: state.deps,
      }),
    ).rejects.toThrow("menu failed");
    expect(state.state.pendingToolCalls).toEqual([]);
    expect(state.deps.promptRecoveryMenu).toHaveBeenCalledWith(error, {
      input: undefined,
      output: undefined,
    });
  });

  test.each([
    ["retry", false],
    ["debug-retry", true],
  ])("recreates the client for %s menu choices", async (choice, enableDebug) => {
    const state = setup({
      promptRecoveryMenu: jest.fn(async () => choice),
      decideRecoveryMenuChoice: jest.fn(() => ({ action: choice, recoveryAttempts: 3 })),
    });
    await expect(
      state.resolve(new Error("failure"), { createSessionClient: jest.fn(() => "fresh") }),
    ).resolves.toEqual({ control: "retry" });
    expect(state.state.openai).toBe("new-client");
    expect(state.state.retryRequest).toBe(state.state.pendingRetryRequest);
    expect(state.state.debugEnabled).toBe(enableDebug);
    expect(state.deps.bindDebugListeners).toHaveBeenCalledTimes(enableDebug ? 1 : 0);
  });

  test("does not re-enable debugging when it is already enabled", async () => {
    const state = setup({
      promptRecoveryMenu: jest.fn(async () => "debug-retry"),
      decideRecoveryMenuChoice: jest.fn(() => ({ action: "debug-retry", recoveryAttempts: 3 })),
    });
    state.state.debugEnabled = true;
    await expect(state.resolve(new Error("failure"))).resolves.toEqual({ control: "retry" });
    expect(state.deps.bindDebugListeners).not.toHaveBeenCalled();
    expect(state.deps.writeDebugEnabled).not.toHaveBeenCalled();
  });

  test.each(["rollback", "stay"])("ends without state changes for an unselected %s action", async (choice) => {
    const state = setup({
      promptRecoveryMenu: jest.fn(async () => choice),
      decideRecoveryMenuChoice: jest.fn(() => ({ action: choice, recoveryAttempts: 2 })),
    });
    await expect(state.resolve(new Error("failure"))).resolves.toEqual({ control: "end" });
    expect(state.deps.applyRollback).not.toHaveBeenCalled();
    expect(state.deps.clearSession).not.toHaveBeenCalled();
  });

  test("retries a menu-selected new chain and ends after clear or rollback", async () => {
    const chain = setup({
      promptRecoveryMenu: jest.fn(async () => "new-chain"),
      decideRecoveryMenuChoice: jest.fn(() => ({ action: "new-chain", recoveryAttempts: 2 })),
    });
    await expect(chain.resolve(new Error("failure"))).resolves.toEqual({ control: "retry" });
    expect(chain.state.previousResponseId).toBe("");

    const clear = setup({
      promptRecoveryMenu: jest.fn(async () => "clear"),
      decideRecoveryMenuChoice: jest.fn(() => ({ action: "clear", recoveryAttempts: 2 })),
    });
    await expect(
      clear.resolve(new Error("failure"), { statePath: "session.json" }),
    ).resolves.toEqual({
      control: "end",
    });
    expect(clear.deps.resetState).toHaveBeenCalledWith("empty-usage");
    expect(clear.deps.clearSession).toHaveBeenCalledWith("session.json");

    const rollback = setup({
      promptRecoveryMenu: jest.fn(async () => "rollback"),
      decideRecoveryMenuChoice: jest.fn(() => ({ action: "rollback", recoveryAttempts: 2 })),
      promptRollback: jest.fn(async () => ({ response_id: "checkpoint" })),
    });
    await expect(
      rollback.resolve(new Error("failure"), { history: [{ response_id: "checkpoint" }] }),
    ).resolves.toEqual({ control: "end" });
    expect(rollback.deps.applyRollback).toHaveBeenCalledWith({ response_id: "checkpoint" });
    expect(rollback.deps.persistCheckpoint).toHaveBeenCalledTimes(1);
  });
});
