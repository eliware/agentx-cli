import { describe, expect, jest, test } from "@jest/globals";
import { finalizeAgentTurn } from "../../src/agent/session-turn-finalization.mjs";

function stateAccessors(state) {
  let current = { response_id: "old", usage: { turns: 1 }, history: [], ...state };
  return {
    getState: () => current,
    setState: jest.fn((next) => {
      current = next;
    }),
  };
}

function services(overrides = {}) {
  return {
    extractAssistantText: () => "answer",
    saveState: jest.fn(),
    persistCheckpoint: jest.fn(),
    checkpointPath: "checkpoint.json",
    clearSession: jest.fn(),
    statePath: "session.json",
    ...overrides,
  };
}

describe("session turn finalization", () => {
  test("saves transitioned state before persisting its checkpoint", async () => {
    const order = [];
    const state = stateAccessors();
    const service = services({
      setState: jest.fn((next) => {
        order.push("state");
        state.setState(next);
      }),
      saveState: jest.fn(async () => order.push("save")),
      persistCheckpoint: jest.fn(async () => order.push("checkpoint")),
    });
    const result = await finalizeAgentTurn({
      response: { id: "response-next" },
      userMessage: "question",
      oneShot: false,
      ...state,
      ...service,
    });
    expect(result).toEqual({ status: "completed", responseId: "response-next" });
    expect(order).toEqual(["state", "save", "checkpoint"]);
    expect(service.persistCheckpoint).toHaveBeenCalledWith(
      "checkpoint.json",
      expect.objectContaining({ response_id: "response-next" }),
    );
  });

  test("clears one-shot state before the completion callback", async () => {
    const order = [];
    const state = stateAccessors();
    const service = services({
      saveState: jest.fn(async () => order.push("save")),
      clearSession: jest.fn(async (path) => order.push(`clear:${path}`)),
      onOneShotComplete: async () => order.push("exit-summary"),
    });
    await finalizeAgentTurn({
      response: { id: "worker-response" },
      userMessage: "worker task",
      oneShot: true,
      ...state,
      ...service,
    });
    expect(order).toEqual(["save", "clear:session.json", "exit-summary"]);
    expect(service.persistCheckpoint).not.toHaveBeenCalled();
  });

  test("uses the default completion callback for one-shot responses without IDs", async () => {
    const state = stateAccessors();
    const service = services();
    await expect(
      finalizeAgentTurn({
        response: {},
        userMessage: "task",
        oneShot: true,
        ...state,
        ...service,
      }),
    ).resolves.toMatchObject({ status: "completed", responseId: "old" });
    expect(service.clearSession).toHaveBeenCalledWith("session.json");
  });

  test("uses current state for a checkpoint when the response has no ID", async () => {
    const state = stateAccessors();
    const service = services();
    await finalizeAgentTurn({
      response: {},
      userMessage: "task",
      oneShot: false,
      ...state,
      ...service,
    });
    expect(service.persistCheckpoint).toHaveBeenCalledWith(
      "checkpoint.json",
      expect.objectContaining({
        response_id: undefined,
        usage: state.getState().usage,
        last_user_message: "task",
        last_assistant_message: "answer",
      }),
    );
  });
});
