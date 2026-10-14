import { expect, jest, test } from "@jest/globals";

const persistResponseState = jest.fn();
const persistCheckpoint = jest.fn();
const extractTextFromResponse = jest.fn(() => "assistant text");
const confirmationFilePath = jest.fn(() => "confirmations.json");
const loadGlobalConfirmations = jest.fn(async () => new Set(["trusted"]));
const saveState = jest.fn();
const persistence = {
  saveState,
  persistResponseSnapshot: jest.fn(),
  persistToolExecutionState: jest.fn(),
  resetState: jest.fn(),
  applyRollback: jest.fn(),
};
const createSessionPersistence = jest.fn(() => persistence);
const handleImageGeneration = jest.fn();
const handleSessionImageGeneration = jest.fn(() => handleImageGeneration);
const confirmToolCall = jest.fn();
const createSessionToolConfirmer = jest.fn(() => confirmToolCall);
const exitSessionWithSummary = jest.fn();
const printUsageReport = jest.fn();
const getAgentPersistedState = jest.fn(() => ({ response_id: "saved" }));
const applyAgentPersistedState = jest.fn();

await jest.unstable_mockModule("../../src/conversation-state.mjs", () => ({
  persistResponseState,
}));
await jest.unstable_mockModule("../../src/conversation-checkpoint.mjs", () => ({
  persistCheckpoint,
}));
await jest.unstable_mockModule("../../src/response.mjs", () => ({ extractTextFromResponse }));
await jest.unstable_mockModule("../../src/confirmation-policy.mjs", () => ({
  confirmationFilePath,
  loadGlobalConfirmations,
}));
await jest.unstable_mockModule("../../src/agent/conversation-persistence.mjs", () => ({
  createSessionPersistence,
}));
await jest.unstable_mockModule("../../src/agent/session-image-generation.mjs", () => ({
  handleSessionImageGeneration,
}));
await jest.unstable_mockModule("../../src/agent/session-confirmation.mjs", () => ({
  createSessionToolConfirmer,
}));
await jest.unstable_mockModule("../../src/agent/session-exit.mjs", () => ({
  exitSessionWithSummary,
}));
await jest.unstable_mockModule("../../src/agent/repl.mjs", () => ({ printUsageReport }));
await jest.unstable_mockModule("../../src/agent/runtime-state-persistence.mjs", () => ({
  applyAgentPersistedState,
  getAgentPersistedState,
}));

const { createAgentRuntimeServices } = await import("../../src/agent/runtime-services.mjs");

test("composes persistence, confirmation, image, and exit services", async () => {
  const session = {
    statePath: "state.json",
    checkpointPath: "checkpoint.json",
    oneShot: false,
    savedState: { goal: { text: "goal" } },
    outputFlags: { noUsage: true },
  };
  const runtimeState = {
    pendingCliTranscript: "before",
    sessionUsage: { turns: 2 },
    template: { model: "test-model" },
  };
  const terminalInput = { isTTY: true };
  const repl = { getReadline: jest.fn(() => "readline") };

  const services = await createAgentRuntimeServices({
    session,
    runtimeState,
    terminalInput,
    repl,
  });

  expect(confirmationFilePath).toHaveBeenCalledTimes(1);
  expect(loadGlobalConfirmations).toHaveBeenCalledWith("confirmations.json");
  expect(createSessionPersistence).toHaveBeenCalledWith(
    expect.objectContaining({
      statePath: "state.json",
      checkpointPath: "checkpoint.json",
      oneShot: false,
      persistResponseState,
      persistCheckpoint,
      extractAssistantText: extractTextFromResponse,
    }),
  );
  const persistenceOptions = createSessionPersistence.mock.calls[0][0];
  expect(persistenceOptions.getState()).toEqual({ response_id: "saved" });
  persistenceOptions.setState({ response_id: "next" });
  expect(applyAgentPersistedState).toHaveBeenCalledWith(runtimeState, { response_id: "next" });
  expect(handleSessionImageGeneration).toHaveBeenCalledWith({
    getTranscript: expect.any(Function),
    setTranscript: expect.any(Function),
    saveState,
  });
  const imageOptions = handleSessionImageGeneration.mock.calls[0][0];
  expect(imageOptions.getTranscript()).toBe("before");
  imageOptions.setTranscript("after");
  expect(runtimeState.pendingCliTranscript).toBe("after");
  expect(createSessionToolConfirmer).toHaveBeenCalledWith({
    oneShot: false,
    isTTY: true,
    getReadline: repl.getReadline,
    sessionConfirmations: expect.any(Set),
    globalConfirmations: new Set(["trusted"]),
    globalConfirmationPath: "confirmations.json",
  });
  expect(services.confirmToolCall).toBe(confirmToolCall);
  expect(services.handleImageGeneration).toBe(handleImageGeneration);
  expect(saveState).toHaveBeenCalledTimes(1);

  services.exitWithSummary({ leadingNewline: true });
  services.exitWithSummary();
  services.exitWithSummary({});
  expect(exitSessionWithSummary).toHaveBeenCalledWith({
    noUsage: true,
    usage: runtimeState.sessionUsage,
    model: "test-model",
    leadingNewline: true,
    readline: "readline",
    printUsageReport,
  });
  expect(exitSessionWithSummary).toHaveBeenLastCalledWith({
    noUsage: true,
    usage: runtimeState.sessionUsage,
    model: "test-model",
    leadingNewline: false,
    readline: "readline",
    printUsageReport,
  });

  await createAgentRuntimeServices({
    session: { ...session, savedState: null },
    runtimeState,
    terminalInput,
    repl,
  });
  expect(saveState).toHaveBeenCalledTimes(1);
});
