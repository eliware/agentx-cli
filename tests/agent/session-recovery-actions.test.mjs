import { describe, expect, jest, test } from "@jest/globals";
import { applySessionRecoveryAction } from "../../src/agent/session-recovery-actions.mjs";
import { setup } from "../../test-fixtures/session-request-recovery-helpers.mjs";

describe("session recovery actions", () => {
  test.each(["retry", "debug-retry"])("recreates the client for %s", async (action) => {
    const { state, deps } = setup(() => {});
    const result = await applySessionRecoveryAction({
      action,
      state,
      createSessionClient: jest.fn(() => "fresh"),
      deps,
    });
    expect(result).toEqual({ control: "retry" });
    expect(state.openai).toBe("new-client");
    expect(state.retryRequest).toBe(state.pendingRetryRequest);
    expect(deps.setActiveOpenAI).toHaveBeenCalledWith("new-client");
    expect(deps.bindDebugListeners).toHaveBeenCalledTimes(action === "debug-retry" ? 1 : 0);
    expect(deps.writeDebugEnabled).toHaveBeenCalledTimes(action === "debug-retry" ? 1 : 0);
  });

  test("does not repeat debug setup when debugging is active", async () => {
    const { state, deps } = setup(() => {});
    state.debugEnabled = true;
    await applySessionRecoveryAction({ action: "debug-retry", state, deps });
    expect(deps.bindDebugListeners).not.toHaveBeenCalled();
    expect(deps.writeDebugEnabled).not.toHaveBeenCalled();
  });

  test("starts a new chain and persists the changed state", async () => {
    const { state, deps } = setup(() => {});
    await expect(applySessionRecoveryAction({ action: "new-chain", state, deps })).resolves.toEqual(
      { control: "retry" },
    );
    expect(state.previousResponseId).toBe("");
    expect(state.pendingTransaction).toBeNull();
    expect(deps.saveState).toHaveBeenCalledTimes(1);
  });

  test("applies and saves a selected rollback", async () => {
    const { state, deps } = setup(() => {});
    const selected = { response_id: "checkpoint" };
    deps.promptRollback.mockResolvedValue(selected);
    await expect(
      applySessionRecoveryAction({
        action: "rollback",
        state,
        history: [selected],
        input: "in",
        output: "out",
        checkpointPath: "checkpoint.json",
        deps,
      }),
    ).resolves.toEqual({ control: "end" });
    expect(deps.applyRollback).toHaveBeenCalledWith(selected);
    expect(deps.persistCheckpoint).toHaveBeenCalledWith("checkpoint.json", selected);
  });

  test("does not save when rollback has no selection", async () => {
    const { state, deps } = setup(() => {});
    await applySessionRecoveryAction({ action: "rollback", state, deps });
    expect(deps.saveState).not.toHaveBeenCalled();
  });

  test("clears session state and ends for clear and unknown actions", async () => {
    const { state, deps } = setup(() => {});
    await expect(
      applySessionRecoveryAction({ action: "clear", state, statePath: "session.json", deps }),
    ).resolves.toEqual({ control: "end" });
    expect(deps.clearSession).toHaveBeenCalledWith("session.json");
    expect(deps.resetState).toHaveBeenCalledWith("empty-usage");
    expect(deps.writeSystem).toHaveBeenCalledWith("Session cleared");
    await expect(applySessionRecoveryAction({ action: "stay", state, deps })).resolves.toEqual({
      control: "end",
    });
  });
});
