process.env.AGENTX_RUNTIME_CASES = "10";
await import("../../test-fixtures/agent/runtime-suite.mjs");
import { expect, test } from "@jest/globals";
import {
  applyAgentPersistedState,
  getAgentPersistedState,
} from "../../src/agent/runtime-state-persistence.mjs";

test("maps runtime state to saved fields and restores it", () => {
  const state = { previousResponseId: "resp-1", sessionUsage: { turns: 1 } };
  const saved = getAgentPersistedState(state);
  expect(saved).toMatchObject({ response_id: "resp-1", usage: { turns: 1 } });
  applyAgentPersistedState(state, { ...saved, response_id: "resp-2" });
  expect(state.previousResponseId).toBe("resp-2");
});
