import { describe, expect, jest, test } from "@jest/globals";
import { recoverPendingSession } from "../../src/agent/session-pending-recovery.mjs";
import { harness } from "../../test-fixtures/session-pending-recovery-helpers.mjs";

describe("session pending recovery", () => {
  test("routes the new-session choice to abandonment without creating a runner", async () => {
    const ctx = harness("new-session");
    await recoverPendingSession({
      savedState: {},
      getState: ctx.getState,
      setState: ctx.setState,
      execute: jest.fn(),
      deps: ctx.deps,
    });
    expect(ctx.deps.createRunner).not.toHaveBeenCalled();
  });

  test("passes the selected choice and saved calls to the resume runner", async () => {
    const ctx = harness("auto-resume");
    const savedState = { pending_tool_calls: [{ id: "saved-call" }] };
    const execute = jest.fn(async () => ({ id: "next-response" }));
    await recoverPendingSession({
      savedState,
      getState: ctx.getState,
      setState: ctx.setState,
      execute,
      deps: ctx.deps,
    });
    expect(ctx.deps.promptResumeMenu).toHaveBeenCalledWith(savedState, {
      input: undefined,
      output: undefined,
    });
    expect(ctx.deps.createRunner).toHaveBeenCalledWith("auto", new Set(), new Set());
    expect(execute).toHaveBeenCalledWith("runner");
    expect(ctx.deps.writeSystem).toHaveBeenCalledWith("Resuming pending tool execution");
  });

  test.each(["interrupt-retry", "interrupt-request"])(
    "executes the %s choice through recovery",
    async (choice) => {
      const ctx = harness(choice);
      const execute = jest.fn(async () => ({}));
      await recoverPendingSession({
        savedState: {},
        getState: ctx.getState,
        setState: ctx.setState,
        execute,
        deps: ctx.deps,
      });
      expect(ctx.deps.createRunner).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith("runner");
      expect(ctx.deps.writeSystem).toHaveBeenCalledTimes(1);
    },
  );
});
