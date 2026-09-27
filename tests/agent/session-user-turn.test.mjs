import { describe, expect, jest, test } from "@jest/globals";
import { runSessionUserTurn } from "../../src/agent/session-user-turn.mjs";

function createSession() {
  const values = {
    pendingCliTranscript: "!git status -> clean",
    cwdNote: "in project",
    lastUserMessage: "old",
    openai: { name: "client" },
    previousResponseId: "response-old",
    pendingRetryRequest: { old: true },
    pendingTransaction: { request: { old: true } },
    pendingToolCalls: [{ id: "call" }],
    failedResponse: false,
    debugEnabled: false,
    persistedState: { response_id: "response-old" },
  };
  const session = {
    oneShot: false,
    requestContext: { injected: true },
    checkpointPath: "checkpoint.json",
    statePath: "state.json",
    getPersistedState: () => values.persistedState,
    setPersistedState: jest.fn((value) => {
      values.persistedState = value;
    }),
    saveState: jest.fn(async () => {}),
    persistCheckpoint: jest.fn(),
    clearSession: jest.fn(),
    exitWithSummary: jest.fn(),
  };
  for (const key of [
    "pendingCliTranscript",
    "cwdNote",
    "lastUserMessage",
    "openai",
    "previousResponseId",
    "pendingRetryRequest",
    "pendingTransaction",
    "pendingToolCalls",
    "failedResponse",
    "debugEnabled",
  ]) {
    const suffix = key[0].toUpperCase() + key.slice(1);
    session[`get${suffix}`] = () => values[key];
    session[`set${suffix}`] = (value) => {
      values[key] = value;
    };
  }
  session.getOpenAI = () => values.openai;
  session.setOpenAI = (value) => {
    values.openai = value;
  };
  return { session, values };
}

describe("session user turn", () => {
  test("prepares turn state, passes recovery accessors, and skips finalization without a response", async () => {
    const { session, values } = createSession();
    const order = [];
    session.saveState = jest.fn(async () => order.push("save"));
    const runRequestCycle = jest.fn(async ({ state, context }) => {
      expect(context).toBe(session.requestContext);
      expect(state.openai).toEqual({ name: "client" });
      state.openai = { name: "reconnected" };
      expect(state.previousResponseId).toBe("response-old");
      state.previousResponseId = "response-new";
      expect(state.retryRequest).toBeNull();
      state.retryRequest = { retry: true };
      expect(state.pendingRetryRequest).toBeNull();
      state.pendingRetryRequest = { pending: true };
      expect(state.pendingTransaction).toEqual({ request: { old: true } });
      state.pendingTransaction = { request: { next: true } };
      expect(state.pendingToolCalls).toEqual([{ id: "call" }]);
      state.pendingToolCalls = [];
      expect(state.failedResponse).toBe(false);
      state.failedResponse = true;
      expect(state.recoveryAttempts).toBe(0);
      state.recoveryAttempts += 1;
      expect(state.websocketRecoveryAttempts).toBe(0);
      state.websocketRecoveryAttempts += 1;
      expect(state.websocketRecoveryStartedAt).toBeNull();
      state.websocketRecoveryStartedAt = 123;
      expect(state.debugEnabled).toBe(false);
      state.debugEnabled = true;
      return { response: null };
    });
    const finalizeTurn = jest.fn();

    await expect(
      runSessionUserTurn({
        message: "new question",
        session,
        deps: { now: () => 12, runRequestCycle, finalizeTurn },
      }),
    ).resolves.toBe("continue");

    expect(values.cwdNote).toBe("");
    expect(values.lastUserMessage).toBe("new question");
    expect(values.pendingRetryRequest).toEqual({ pending: true });
    expect(order).toEqual(["save"]);
    expect(finalizeTurn).not.toHaveBeenCalled();
  });

  test("finalizes a completed response and returns one-shot exit action", async () => {
    const { session } = createSession();
    session.oneShot = true;
    const response = { id: "response-done" };
    const runRequestCycle = jest.fn(async () => ({ response }));
    const finalizeTurn = jest.fn(async () => {});
    const extractAssistantText = jest.fn((value) => value.output_text);

    await expect(
      runSessionUserTurn({
        message: "summarize",
        session,
        deps: { now: () => 42, runRequestCycle, finalizeTurn, extractAssistantText },
      }),
    ).resolves.toBe("exit");

    expect(finalizeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        response,
        userMessage: "summarize",
        oneShot: true,
        getState: session.getPersistedState,
        setState: session.setPersistedState,
        extractAssistantText,
        saveState: session.saveState,
        persistCheckpoint: session.persistCheckpoint,
        checkpointPath: "checkpoint.json",
        clearSession: session.clearSession,
        statePath: "state.json",
        onOneShotComplete: session.exitWithSummary,
      }),
    );
  });
});
