import { describe, expect, jest, test } from "@jest/globals";
import {
  recoverPendingSession,
  shouldRecoverPendingSession,
} from "../../src/agent/session-pending-recovery.mjs";
import { harness } from "../../test-fixtures/session-pending-recovery-helpers.mjs";

describe("session pending recovery", () => {
  test.each([
    [{ previousResponseId: "response", pendingToolCalls: [{}], oneShot: false }, true],
    [{ previousResponseId: "", pendingToolCalls: [{}], oneShot: false }, false],
    [{ previousResponseId: "response", pendingToolCalls: [], oneShot: false }, false],
    [{ previousResponseId: "response", pendingToolCalls: [{}], oneShot: true }, false],
  ])("selects interactive pending recovery: %j", (input, expected) => {
    expect(shouldRecoverPendingSession(input)).toBe(expected);
  });

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

  test.each([
    ["interrupt-retry", "retry hint"],
    ["interrupt-request", "interruption notice"],
  ])("shows the %s recovery notice", async (choice, notice) => {
    const ctx = harness(choice);
    await recoverPendingSession({
      savedState: {},
      getState: ctx.getState,
      setState: ctx.setState,
      execute: jest.fn(async () => ({})),
      deps: ctx.deps,
    });
    expect(ctx.deps.writeSystem).toHaveBeenCalledWith(
      `Resuming pending tool execution with ${notice}`,
    );
  });
});
