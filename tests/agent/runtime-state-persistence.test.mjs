import { expect, test } from "@jest/globals";
import {
  applyAgentPersistedState,
  getAgentPersistedState,
  setAgentActiveGoal,
} from "../../src/agent/runtime-state-persistence.mjs";

test("maps runtime state to saved fields and restores it", () => {
  const state = { previousResponseId: "resp-1", sessionUsage: { turns: 1 } };
  const saved = getAgentPersistedState(state);
  expect(saved).toMatchObject({ response_id: "resp-1", usage: { turns: 1 } });
  applyAgentPersistedState(state, { ...saved, response_id: "resp-2" });
  expect(state.previousResponseId).toBe("resp-2");
});

test("updates active goal state through the persistence state boundary", () => {
  const state = { activeGoal: null };
  setAgentActiveGoal(state, { status: "active" });
  expect(state.activeGoal).toEqual({ status: "active" });
});
