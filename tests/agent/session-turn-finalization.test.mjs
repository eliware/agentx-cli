import { describe, expect, jest, test } from "@jest/globals";
import { finalizeAgentTurn } from "../../src/agent/session-turn-finalization.mjs";

function createState(overrides = {}) {
  let state = {
    response_id: "old-response",
    usage: { inputTokens: 3, cachedTokens: 1, outputTokens: 2, turns: 1 },
    last_user_message: "old user",
    last_assistant_message: "old assistant",
    pending_cli_transcript: "!ls",
    pending_tool_calls: [{ call_id: "pending" }],
    pending_retry_request: { input: ["retry"] },
    pending_transaction: { request: { input: ["retry"] } },
    failed_response: true,
    rollback_backup: [{ response_id: "rollback" }],
    history: [{ response_id: "previous" }],
    ...overrides,
  };
  return { getState: () => state, setState: (next) => (state = next) };
}

describe("session turn finalization", () => {
  test("persists completed response state and a successful checkpoint", async () => {
    const session = createState();
    const saveState = jest.fn();
    const persistCheckpoint = jest.fn();
    const clearSession = jest.fn();
    const result = await finalizeAgentTurn({
      response: { id: "response-next" },
      userMessage: "new question",
      oneShot: false,
      ...session,
      extractAssistantText: () => "new answer",
      saveState,
      persistCheckpoint,
      checkpointPath: "checkpoint.json",
      clearSession,
      statePath: "session.json",
    });

    expect(result).toMatchObject({ status: "completed", responseId: "response-next" });
    expect(session.getState()).toMatchObject({
      response_id: "response-next",
      last_user_message: "new question",
      last_assistant_message: "new answer",
      pending_cli_transcript: "",
      pending_tool_calls: [],
      pending_retry_request: null,
      failed_response: false,
      rollback_backup: [],
      history: [
        { response_id: "previous" },
        {
          response_id: "response-next",
          user_preview: "new question",
          assistant_preview: "new answer",
          last_user_message: "new question",
          last_assistant_message: "new answer",
        },
      ],
    });
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(persistCheckpoint).toHaveBeenCalledWith(
      "checkpoint.json",
      expect.objectContaining({ response_id: "response-next", usage: session.getState().usage }),
    );
    expect(clearSession).not.toHaveBeenCalled();
  });

  test("preserves the previous response identity and omits history when the response has no ID", async () => {
    const session = createState();
    const persistCheckpoint = jest.fn();
    await finalizeAgentTurn({
      response: {},
      userMessage: "question",
      oneShot: false,
      ...session,
      extractAssistantText: () => "answer",
      saveState: jest.fn(),
      persistCheckpoint,
      checkpointPath: "checkpoint.json",
      clearSession: jest.fn(),
      statePath: "session.json",
    });
    expect(session.getState().response_id).toBe("old-response");
    expect(session.getState().history).toEqual([{ response_id: "previous" }]);
    expect(persistCheckpoint).toHaveBeenCalledWith(
      "checkpoint.json",
      expect.objectContaining({ response_id: undefined }),
    );
  });

  test("clears one-shot state and delegates the normal usage-summary exit", async () => {
    const session = createState();
    const order = [];
    const persistCheckpoint = jest.fn();
    const result = await finalizeAgentTurn({
      response: { id: "worker-response" },
      userMessage: "worker task",
      oneShot: true,
      ...session,
      extractAssistantText: () => "done",
      saveState: jest.fn(async () => order.push("save")),
      persistCheckpoint,
      clearSession: jest.fn(async (path) => order.push(`clear:${path}`)),
      statePath: "one-shot-state.json",
      checkpointPath: "checkpoint.json",
      onOneShotComplete: async () => order.push("exit-summary"),
    });
    expect(result.status).toBe("completed");
    expect(order).toEqual(["save", "clear:one-shot-state.json", "exit-summary"]);
    expect(persistCheckpoint).not.toHaveBeenCalled();
  });

  test("uses the default completion callback when one-shot response has no id", async () => {
    const session = createState();
    const clearSession = jest.fn();
    await finalizeAgentTurn({
      response: {},
      userMessage: "task",
      oneShot: true,
      ...session,
      extractAssistantText: () => "done",
      saveState: jest.fn(),
      persistCheckpoint: jest.fn(),
      clearSession,
      statePath: "state.json",
    });
    expect(clearSession).toHaveBeenCalledWith("state.json");
  });

  test("creates history when prior history is absent", async () => {
    const session = createState({ history: undefined });
    await finalizeAgentTurn({
      response: { id: "fresh-response" },
      userMessage: "question",
      oneShot: false,
      ...session,
      extractAssistantText: () => "answer",
      saveState: jest.fn(),
      persistCheckpoint: jest.fn(),
      clearSession: jest.fn(),
      statePath: "state.json",
      checkpointPath: "checkpoint.json",
    });
    expect(session.getState().history).toHaveLength(1);
  });
});
