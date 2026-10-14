import { expect, jest, test } from "@jest/globals";

const prepareSessionInput = jest.fn();
const dispatchSessionInput = jest.fn(async () => "dispatched");
const handleSessionPromptError = jest.fn(async () => {});
const runSessionUserTurn = jest.fn(async () => "turn result");
await jest.unstable_mockModule("../../src/terminal-output.mjs", () => ({
  writeTerminal: jest.fn(),
}));
await jest.unstable_mockModule("../../src/shell-display.mjs", () => ({
  formatPromptForCwd: jest.fn(() => "prompt"),
  formatSystemMessage: jest.fn(() => "system"),
}));
await jest.unstable_mockModule("../../src/request-context.mjs", () => ({
  appendCliTranscript: jest.fn(),
}));
await jest.unstable_mockModule("../../src/response.mjs", () => ({
  extractTextFromResponse: jest.fn(),
}));
await jest.unstable_mockModule("../../src/agent/repl.mjs", () => ({ printAgentText: jest.fn() }));
await jest.unstable_mockModule("../../src/agent/session-input.mjs", () => ({
  prepareSessionInput,
}));
await jest.unstable_mockModule("../../src/agent/session-input-dispatch.mjs", () => ({
  dispatchSessionInput,
}));
await jest.unstable_mockModule("../../src/agent/session-prompt-errors.mjs", () => ({
  handleSessionPromptError,
}));
await jest.unstable_mockModule("../../src/agent/session-user-turn.mjs", () => ({
  runSessionUserTurn,
}));
await jest.unstable_mockModule("../../src/agent/session-request-cycle.mjs", () => ({
  runSessionRequestCycle: jest.fn(),
}));
await jest.unstable_mockModule("../../src/agent/session-turn-finalization.mjs", () => ({
  finalizeAgentTurn: jest.fn(),
}));
await jest.unstable_mockModule("../../src/agent/local-shell.mjs", () => ({
  executeLocalShellCommand: jest.fn(),
}));
const { createRuntimePromptInput } = await import("../../src/agent/runtime-prompt-input.mjs");

test("builds prompt, error, input, and user-turn adapters", async () => {
  const readline = { question: jest.fn(async () => "hello") };
  const repl = { getReadline: () => readline, preserveHistory: jest.fn(), replace: jest.fn() };
  const context = {
    oneShot: false,
    initialMessage: null,
    terminalInput: { isTTY: true },
    cwd: "/repo",
    repl,
    getActiveGoal: jest.fn(),
    setActiveGoal: jest.fn(),
    saveState: jest.fn(),
    exitWithSummary: jest.fn(),
    getPendingCliTranscript: jest.fn(() => "before"),
    setPendingCliTranscript: jest.fn(),
    dispatchCommand: jest.fn(),
    userTurnSession: {},
  };
  const callbacks = createRuntimePromptInput(context);
  dispatchSessionInput.mockImplementationOnce(async ({ state, deps }) => {
    expect(state.pendingCliTranscript).toBe("before");
    state.pendingCliTranscript = "after";
    deps.writeSystem("message");
    return "dispatched";
  });
  await expect(callbacks.readPrompt()).resolves.toBe("hello");
  await expect(callbacks.dispatchInput("line")).resolves.toBe("dispatched");
  await expect(callbacks.processMessage("message")).resolves.toBe("turn result");
  await callbacks.handlePromptError(new Error("prompt error"));
  expect(prepareSessionInput).toHaveBeenCalledWith({
    oneShot: false,
    terminalInput: context.terminalInput,
  });
  expect(context.setPendingCliTranscript).toHaveBeenCalledWith("after");
  expect(runSessionUserTurn).toHaveBeenCalledWith(expect.objectContaining({ message: "message" }));
  expect(handleSessionPromptError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
});
