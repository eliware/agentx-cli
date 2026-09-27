import { describe, expect, jest, test } from "@jest/globals";
import {
  recoverPendingSession,
  shouldRecoverPendingSession,
} from "../../src/agent/session-pending-recovery.mjs";

const baseState = () => ({
  response_id: "response-pending",
  usage: { inputTokens: 3 },
  last_user_message: "question",
  last_assistant_message: "partial",
  pending_tool_calls: [{ id: "call-1" }],
  pending_transaction: null,
  pending_retry_request: { request: true },
  failed_response: false,
  history: [],
});

function harness(choice, initialState = baseState()) {
  let state = initialState;
  const deps = {
    promptResumeMenu: jest.fn(async () => choice),
    createUsageTotals: jest.fn(() => ({ turns: 0 })),
    saveState: jest.fn(async () => {}),
    persistCheckpoint: jest.fn(async () => {}),
    writeSystem: jest.fn(),
    resetState: jest.fn((usage) => {
      state = { ...baseState(), usage, pending_tool_calls: [], pending_transaction: null };
    }),
    clearSession: jest.fn(async () => {}),
    createRunner: jest.fn(() => "runner"),
    extractAssistantText: jest.fn((response) => response?.output_text || ""),
  };
  return {
    deps,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
  };
}

describe("session pending recovery", () => {
  test.each([
    [{ previousResponseId: "response", pendingToolCalls: [{}], oneShot: false }, true],
    [{ previousResponseId: "", pendingToolCalls: [{}], oneShot: false }, false],
    [{ previousResponseId: "response", pendingToolCalls: [], oneShot: false }, false],
    [{ previousResponseId: "response", pendingToolCalls: [{}], oneShot: true }, false],
  ])("selects recovery only for interactive pending continuations: %j", (input, expected) => {
    expect(shouldRecoverPendingSession(input)).toBe(expected);
  });

  test("abandons a pending transaction to the last successful checkpoint", async () => {
    const state = baseState();
    state.pending_transaction = { request: { input: [] } };
    state.history = [
      { response_id: "response-good", last_user_message: "old", usage: { turns: 2 } },
    ];
    const ctx = harness("new-session", state);

    await recoverPendingSession({
      savedState: {},
      getState: ctx.getState,
      setState: ctx.setState,
      execute: jest.fn(),
      deps: ctx.deps,
    });

    expect(ctx.getState()).toMatchObject({
      response_id: "response-good",
      last_user_message: "old",
      usage: { turns: 2 },
      pending_tool_calls: [],
      pending_transaction: null,
      pending_retry_request: null,
      failed_response: false,
    });
    expect(ctx.deps.persistCheckpoint).toHaveBeenCalledWith(state.history[0]);
    expect(ctx.deps.saveState).toHaveBeenCalledTimes(1);
  });

  test("clears a new session when there is no pending transaction", async () => {
    const ctx = harness("new-session");
    await recoverPendingSession({
      savedState: {},
      getState: ctx.getState,
      setState: ctx.setState,
      execute: jest.fn(),
      deps: ctx.deps,
    });
    expect(ctx.deps.resetState).toHaveBeenCalledWith({ turns: 0 });
    expect(ctx.deps.clearSession).toHaveBeenCalledTimes(1);
  });

  test("abandons a transaction to an empty session when no checkpoint exists", async () => {
    const state = baseState();
    state.pending_transaction = { request: { input: [] } };
    state.history = [];
    const ctx = harness("new-session", state);
    await recoverPendingSession({
      savedState: {},
      getState: ctx.getState,
      setState: ctx.setState,
      execute: jest.fn(),
      deps: ctx.deps,
    });
    expect(ctx.getState()).toMatchObject({
      response_id: "",
      last_user_message: "",
      last_assistant_message: "",
      usage: { turns: 0 },
    });
    expect(ctx.deps.persistCheckpoint).not.toHaveBeenCalled();
  });

  test("applies a successful resumed response", async () => {
    const ctx = harness("auto-resume");
    const execute = jest.fn(async () => ({ id: "response-next", output_text: "done" }));
    await recoverPendingSession({
      savedState: {},
      getState: ctx.getState,
      setState: ctx.setState,
      execute,
      deps: ctx.deps,
    });
    expect(ctx.getState()).toMatchObject({
      response_id: "response-next",
      last_assistant_message: "done",
      pending_tool_calls: [],
    });
    expect(ctx.deps.saveState).toHaveBeenCalledTimes(1);
  });

  test("retains the previous response id when resume completes without an id", async () => {
    const ctx = harness("interrupt-request");
    await recoverPendingSession({
      savedState: {},
      getState: ctx.getState,
      setState: ctx.setState,
      execute: jest.fn(async () => ({ output_text: "recovered text" })),
      deps: ctx.deps,
    });
    expect(ctx.getState()).toMatchObject({
      response_id: "response-pending",
      last_assistant_message: "recovered text",
    });
    expect(ctx.deps.writeSystem).toHaveBeenCalledWith(
      "Resuming pending tool execution with interruption notice",
    );
  });

  test("shows retry guidance for interrupted retry recovery", async () => {
    const ctx = harness("interrupt-retry");
    await recoverPendingSession({
      savedState: {},
      getState: ctx.getState,
      setState: ctx.setState,
      execute: jest.fn(async () => ({ id: "response-retry" })),
      deps: ctx.deps,
    });
    expect(ctx.deps.writeSystem).toHaveBeenCalledWith(
      "Resuming pending tool execution with retry hint",
    );
  });

  test("clears session when the saved response no longer exists", async () => {
    const ctx = harness("auto-resume");
    const error = Object.assign(new Error("missing"), { code: "previous_response_not_found" });
    await recoverPendingSession({
      savedState: {},
      getState: ctx.getState,
      setState: ctx.setState,
      execute: async () => {
        throw error;
      },
      deps: ctx.deps,
    });
    expect(ctx.deps.resetState).toHaveBeenCalledTimes(1);
    expect(ctx.deps.clearSession).toHaveBeenCalledTimes(1);
    expect(ctx.deps.writeSystem).toHaveBeenCalledWith(
      "Pending response not found; clearing session",
    );
  });

  test.each([
    [true, 1],
    [false, 0],
  ])(
    "persists failure and preserves pending calls only when a retry transaction exists (%s)",
    async (preservePendingCalls, expectedCalls) => {
      const ctx = harness("auto-resume");
      const error = new Error("resume failed");
      ctx.deps.createRunner.mockImplementation(() => () => {});
      const execute = async () => {
        throw error;
      };
      // A request marks the saved transaction as replayable and therefore preservable.
      if (preservePendingCalls) ctx.getState().pending_transaction = { request: {} };
      await recoverPendingSession({
        savedState: {},
        getState: ctx.getState,
        setState: ctx.setState,
        execute,
        deps: ctx.deps,
      });
      expect(ctx.getState().failed_response).toBe(true);
      expect(ctx.getState().pending_tool_calls).toHaveLength(expectedCalls);
      expect(ctx.deps.saveState).toHaveBeenCalledTimes(1);
    },
  );

  test("formats a resumed failure without an error message", async () => {
    const ctx = harness("auto-resume");
    await recoverPendingSession({
      savedState: {},
      getState: ctx.getState,
      setState: ctx.setState,
      execute: async () => {
        throw {};
      },
      deps: ctx.deps,
    });
    expect(ctx.deps.writeSystem).toHaveBeenCalledWith(
      "Pending response failed: [object Object]. Session preserved.",
    );
  });
});
