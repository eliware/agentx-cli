import { expect, test } from "@jest/globals";
import { createAgentUserTurnSession } from "../../src/agent/runtime-user-turn-session.mjs";

test("builds the user turn session", () => {
  const runtimeState = { executionJournal: ["started"] };
  const session = createAgentUserTurnSession({
    runtimeState,
    sessionPersistence: { getState: () => ({}), setState: () => {} },
  });
  expect(session.getExecutionJournal()).toEqual(["started"]);
  session.setExecutionJournal([]);
  expect(runtimeState.executionJournal).toEqual([]);
});
