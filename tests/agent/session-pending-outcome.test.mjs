import { describe, expect, jest, test } from "@jest/globals";
import { applyPendingRecoveryOutcome } from "../../src/agent/session-pending-outcome.mjs";
import { baseState, harness } from "../../test-fixtures/session-pending-recovery-helpers.mjs";

describe("pending recovery outcome", () => {
  test("persists the state after a completed recovery", async () => {
    const ctx = harness("auto-resume");
    const order = [];
    const setState = jest.fn((state) => {
      order.push("state");
      ctx.setState(state);
    });
    ctx.deps.saveState = jest.fn(async () => order.push("save"));
    await applyPendingRecoveryOutcome({
      result: { status: "completed", response: { id: "next", output_text: "done" } },
      state: ctx.getState(),
      setState,
      deps: ctx.deps,
    });
    expect(setState).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["state", "save"]);
  });

  test("clears session state when the response is missing", async () => {
    const ctx = harness("auto-resume");
    await applyPendingRecoveryOutcome({
      result: { status: "missing-response" },
      state: ctx.getState(),
      setState: ctx.setState,
      deps: ctx.deps,
    });
    expect(ctx.deps.resetState).toHaveBeenCalledWith({ turns: 0 });
    expect(ctx.deps.saveState).not.toHaveBeenCalled();
  });

  test("persists a failed recovery outcome", async () => {
    const ctx = harness("auto-resume");
    await applyPendingRecoveryOutcome({
      result: { status: "failed", preservePendingCalls: true, error: new Error("broken") },
      state: baseState(),
      setState: ctx.setState,
      deps: ctx.deps,
    });
    expect(ctx.deps.saveState).toHaveBeenCalledTimes(1);
  });

  test("formats a failed outcome with no error message", async () => {
    const ctx = harness("auto-resume");
    await applyPendingRecoveryOutcome({
      result: { status: "failed", error: {} },
      state: baseState(),
      setState: ctx.setState,
      deps: ctx.deps,
    });
    expect(ctx.deps.writeSystem).toHaveBeenCalledWith(
      "Pending response failed: [object Object]. Session preserved.",
    );
  });
});
