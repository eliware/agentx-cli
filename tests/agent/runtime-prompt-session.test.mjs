import { expect, jest, test } from "@jest/globals";

const prepareSessionInput = jest.fn();
const dispatchSessionInput = jest.fn(async () => "dispatched");
const handleSessionPromptError = jest.fn(async () => {});
const runSessionPromptLoop = jest.fn(async () => "loop result");
const runSessionUserTurn = jest.fn(async () => "turn result");
const shutdownAgentPromptSession = jest.fn(async () => {});
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
await jest.unstable_mockModule("../../src/agent/session-prompt-loop.mjs", () => ({
  runSessionPromptLoop,
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
await jest.unstable_mockModule("../../src/agent/runtime-session-shutdown.mjs", () => ({
  shutdownAgentPromptSession,
}));
await jest.unstable_mockModule("../../src/agent/local-shell.mjs", () => ({
  executeLocalShellCommand: jest.fn(),
}));
const { runAgentPromptSession } = await import("../../src/agent/runtime-prompt-session.mjs");

test("maps runtime services into prompt callbacks", async () => {
  const runLoop = jest.fn(async () => {});
  const terminalInput = { isTTY: true, setRawMode: jest.fn() };
  const context = {
    oneShot: false,
    initialMessage: null,
    terminalInput,
    repl: {},
    openai: {},
    signalRegistration: null,
  };
  await expect(
    runAgentPromptSession(context, { runLoop, shutdown: jest.fn() }),
  ).resolves.toBeUndefined();
  expect(runLoop).toHaveBeenCalledWith(expect.objectContaining({ oneShot: false }));
  expect(terminalInput.setRawMode).toHaveBeenCalledWith(false);
});

test("uses the default prompt loop and shutdown services", async () => {
  const context = { repl: {}, terminalInput: null };
  await runAgentPromptSession(context);
  expect(runSessionPromptLoop).toHaveBeenCalledWith(
    expect.objectContaining({ oneShot: undefined }),
  );
  expect(shutdownAgentPromptSession).toHaveBeenCalledWith(
    expect.objectContaining({ repl: context.repl, openai: undefined }),
  );
});
