import { describe, expect, jest, test } from "@jest/globals";
import { resolveSessionRequestFailure } from "../../src/agent/session-request-recovery.mjs";
import { setup } from "../../test-fixtures/session-request-recovery-helpers.mjs";

describe("session request recovery flow", () => {
  test.each([
    ["reconnect", true],
    ["new-chain", false],
  ])("routes %s failures through the retry decision", async (action, websocketRetryAvailable) => {
    const state = setup(resolveSessionRequestFailure, {
      isWebsocketRecoveryError: jest.fn(() => websocketRetryAvailable),
      waitForWebsocketRetry: jest.fn(async () => websocketRetryAvailable),
      decideRequestFailure: jest.fn(() => ({ action, recoveryAttempts: 1 })),
    });
    await expect(state.resolve(new Error("request failed"))).resolves.toEqual({ control: "retry" });
    expect(state.deps.decideRequestFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ websocketRetryAvailable }),
    );
  });

  test("retries a one-shot pending continuation and otherwise returns the original error", async () => {
    const retry = setup(resolveSessionRequestFailure, {
      decideRequestFailure: jest.fn(() => ({ action: "retry-pending", recoveryAttempts: 1 })),
    });
    await expect(retry.resolve(new Error("temporary"), { oneShot: true })).resolves.toEqual({
      control: "retry",
    });
    expect(retry.state.retryRequest).toBe(retry.state.pendingRetryRequest);

    const failed = setup(resolveSessionRequestFailure, {
      decideRequestFailure: jest.fn(() => ({ action: "fail", recoveryAttempts: 1 })),
    });
    const error = new Error("request failed");
    await expect(failed.resolve(error, { oneShot: true })).resolves.toEqual({
      control: "throw",
      error,
    });
  });

  test("ends the recovery workflow when the user cancels the menu", async () => {
    const abort = Object.assign(new Error("cancel"), { name: "AbortError" });
    const { deps, resolve } = setup(resolveSessionRequestFailure, {
      promptRecoveryMenu: jest.fn(async () => {
        throw abort;
      }),
    });
    await expect(resolve(new Error("failure"))).resolves.toEqual({ control: "end" });
    expect(deps.decideRecoveryMenuChoice).not.toHaveBeenCalled();
  });

  test("defaults omitted history and clears pending calls when no transaction request exists", async () => {
    const state = setup(resolveSessionRequestFailure, {
      decideRequestFailure: jest.fn(() => ({ action: "fail", recoveryAttempts: 1 })),
    });
    state.state.pendingTransaction = null;
    state.deps.promptRecoveryMenu.mockRejectedValue(new Error("menu failed"));
    const error = new Error("request failed");
    await expect(
      resolveSessionRequestFailure({ error, state: state.state, oneShot: false, deps: state.deps }),
    ).rejects.toThrow("menu failed");
    expect(state.state.pendingToolCalls).toEqual([]);
    expect(state.deps.promptRecoveryMenu).toHaveBeenCalledWith(error, {
      input: undefined,
      output: undefined,
    });
  });

  test("routes a menu choice through the recovery action service", async () => {
    const state = setup(resolveSessionRequestFailure, {
      promptRecoveryMenu: jest.fn(async () => "retry"),
      decideRecoveryMenuChoice: jest.fn(() => ({ action: "retry", recoveryAttempts: 3 })),
      recreateOpenAIClient: jest.fn(async () => "fresh"),
    });
    await expect(state.resolve(new Error("failure"))).resolves.toEqual({ control: "retry" });
    expect(state.deps.decideRecoveryMenuChoice).toHaveBeenCalledWith("retry", {
      recoveryAttempts: 1,
      newChainAttempts: undefined,
    });
    expect(state.state.recoveryAttempts).toBe(3);
  });
});
