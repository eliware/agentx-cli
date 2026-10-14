import { describe, expect, test } from "@jest/globals";
import { applyPendingRecoveryOutcome } from "../../src/agent/session-pending-outcome.mjs";
import { baseState, harness } from "../../test-fixtures/session-pending-recovery-helpers.mjs";

describe("pending recovery outcome", () => {
  test("stores a completed response and clears pending calls", async () => {
    const ctx = harness("auto-resume");
    await applyPendingRecoveryOutcome({
      result: { status: "completed", response: { id: "next", output_text: "done" } },
      state: ctx.getState(),
      setState: ctx.setState,
      deps: ctx.deps,
    });
    expect(ctx.getState()).toMatchObject({
      response_id: "next",
      last_assistant_message: "done",
      pending_tool_calls: [],
    });
    expect(ctx.deps.saveState).toHaveBeenCalledTimes(1);
  });

  test("keeps the prior response ID when completion has no ID", async () => {
    const ctx = harness("auto-resume");
    await applyPendingRecoveryOutcome({
      result: { status: "completed", response: { output_text: "done" } },
      state: ctx.getState(),
      setState: ctx.setState,
      deps: ctx.deps,
    });
    expect(ctx.getState().response_id).toBe("response-pending");
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
    expect(ctx.deps.clearSession).toHaveBeenCalledTimes(1);
    expect(ctx.deps.saveState).not.toHaveBeenCalled();
  });

  test.each([
    [true, 1],
    [false, 0],
  ])(
    "persists failed state and preserves calls only when allowed (%s)",
    async (preservePendingCalls, count) => {
      const ctx = harness("auto-resume");
      await applyPendingRecoveryOutcome({
        result: { status: "failed", preservePendingCalls, error: new Error("broken") },
        state: baseState(),
        setState: ctx.setState,
        deps: ctx.deps,
      });
      expect(ctx.getState().failed_response).toBe(true);
      expect(ctx.getState().pending_tool_calls).toHaveLength(count);
      expect(ctx.deps.saveState).toHaveBeenCalledTimes(1);
    },
  );

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
