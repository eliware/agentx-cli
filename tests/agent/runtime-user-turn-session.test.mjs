import { expect, test } from "@jest/globals";
import { createAgentUserTurnSession } from "../../src/agent/runtime-user-turn-session.mjs";

test("builds the user turn session", () => {
  const runtimeState = {
    pendingCliTranscript: "transcript",
    cwdNote: "note",
    openai: "client",
    previousResponseId: "response",
    pendingRetryRequest: "retry",
    pendingTransaction: "transaction",
    pendingToolCalls: ["call"],
    executionJournal: ["started"],
    failedResponse: false,
    debugEnabled: true,
  };
  const persistence = { getState: () => "saved", setState() {} };
  const dependencies = {
    runtimeState,
    sessionPersistence: persistence,
    requestContext: { context: true },
    oneShot: true,
    checkpointPath: "checkpoint",
    statePath: "state",
    exitWithSummary() {},
    saveState() {},
    persistCheckpoint() {},
    clearSession() {},
  };
  const session = createAgentUserTurnSession({
    ...dependencies,
  });
  expect(session).toMatchObject({
    oneShot: true,
    checkpointPath: "checkpoint",
    statePath: "state",
    requestContext: { context: true },
  });
  expect(session.getPersistedState()).toBe("saved");
  expect(session.setPersistedState).toBe(persistence.setState);
  expect(session.getPendingCliTranscript()).toBe("transcript");
  expect(session.getCwdNote()).toBe("note");
  session.setCwdNote("next note");
  session.setLastUserMessage("question");
  expect(runtimeState).toMatchObject({ cwdNote: "next note", lastUserMessage: "question" });
  expect(session.getOpenAI()).toBe("client");
  session.setOpenAI("next client");
  expect(session.getOpenAI()).toBe("next client");
  expect(session.getPreviousResponseId()).toBe("response");
  session.setPreviousResponseId("next response");
  expect(session.getPreviousResponseId()).toBe("next response");
  expect(session.getPendingRetryRequest()).toBe("retry");
  session.setPendingRetryRequest(null);
  expect(session.getPendingRetryRequest()).toBeNull();
  expect(session.getPendingTransaction()).toBe("transaction");
  session.setPendingTransaction(null);
  expect(session.getPendingTransaction()).toBeNull();
  expect(session.getPendingToolCalls()).toEqual(["call"]);
  session.setPendingToolCalls([]);
  expect(session.getPendingToolCalls()).toEqual([]);
  expect(session.getExecutionJournal()).toEqual(["started"]);
  session.setExecutionJournal([]);
  expect(runtimeState.executionJournal).toEqual([]);
  expect(session.getFailedResponse()).toBe(false);
  session.setFailedResponse(true);
  expect(session.getFailedResponse()).toBe(true);
  expect(session.getDebugEnabled()).toBe(true);
  session.setDebugEnabled(false);
  expect(session.getDebugEnabled()).toBe(false);
  expect(session.exitWithSummary).toBe(dependencies.exitWithSummary);
  expect(session.saveState).toBe(dependencies.saveState);
  expect(session.persistCheckpoint).toBe(dependencies.persistCheckpoint);
  expect(session.clearSession).toBe(dependencies.clearSession);
});
