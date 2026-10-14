import { expect, jest, test } from "@jest/globals";

const setTerminalOutputOptions = jest.fn();
const writeTerminal = jest.fn();
const formatSystemMessage = jest.fn();
const formatUsageReport = jest.fn();
const formatStartupSettings = jest.fn(() => "settings");
const settingsFromEnv = jest.fn(() => ({}));
const createReplInterface = jest.fn();
const printResumeMessage = jest.fn();
const createAgentClient = jest.fn(() => "client");
const presentAgentSession = jest.fn();
const setActiveClient = jest.fn();
const reportSessionWorkerUsage = jest.fn();
const createSessionRepl = jest.fn(() => "repl");

await jest.unstable_mockModule("../../src/terminal-output.mjs", () => ({
  setTerminalOutputOptions,
  writeTerminal,
}));
await jest.unstable_mockModule("../../src/shell-display.mjs", () => ({ formatSystemMessage }));
await jest.unstable_mockModule("../../src/response.mjs", () => ({ formatUsageReport }));
await jest.unstable_mockModule("../../src/settings.mjs", () => ({
  formatStartupSettings,
  settingsFromEnv,
}));
await jest.unstable_mockModule("../../src/agent/repl.mjs", () => ({
  createReplInterface,
  printResumeMessage,
}));
await jest.unstable_mockModule("../../src/agent/client.mjs", () => ({ createAgentClient }));
await jest.unstable_mockModule("../../src/agent/session-presentation.mjs", () => ({
  presentAgentSession,
}));
await jest.unstable_mockModule("../../src/agent/process-lifecycle.mjs", () => ({
  agentProcessLifecycle: { setActiveClient },
}));
await jest.unstable_mockModule("../../src/agent/session-worker-usage.mjs", () => ({
  reportSessionWorkerUsage,
}));
await jest.unstable_mockModule("../../src/agent/session-repl.mjs", () => ({ createSessionRepl }));

const { startAgentRuntime } = await import("../../src/agent/runtime-startup.mjs");

test("starts a runtime and selects startup settings from quiet mode", async () => {
  const session = {
    outputFlags: { noColors: true, quiet: false, noUsage: true },
    apiKey: "key",
    savedState: {},
    savedResponseId: "response",
    restoredSession: { previousResponseId: "response" },
    agentsText: "rules",
    template: { model: "test-model" },
  };
  const started = await startAgentRuntime({
    session,
    cwd: "C:/work",
    oneShot: false,
    terminalInput: "input",
    terminalOutput: "output",
  });

  expect(started.runtimeState.openai).toBe("client");
  expect(started.createSessionClient()).toBe("client");
  expect(createAgentClient.mock.calls.at(-1)[0].isDebugEnabled()).toBe(false);
  expect(started.repl).toBe("repl");
  expect(setTerminalOutputOptions).toHaveBeenCalledWith({ colors: false });
  expect(setActiveClient).toHaveBeenCalledWith("client");
  expect(formatStartupSettings).toHaveBeenCalledWith({});
  expect(presentAgentSession).toHaveBeenCalledWith(
    expect.objectContaining({ settings: "settings", formatSystemMessage, write: writeTerminal }),
  );
  expect(createSessionRepl).toHaveBeenCalledWith(
    expect.objectContaining({ oneShot: false, input: "input", output: "output" }),
  );
  expect(createSessionRepl.mock.calls.at(-1)[0].getCwd()).toBe("C:/work");
  started.onWorkerComplete("worker");
  expect(reportSessionWorkerUsage).toHaveBeenCalledWith({
    worker: "worker",
    noUsage: true,
    model: "test-model",
    formatUsageReport,
    write: writeTerminal,
  });

  const quietSession = { ...session, outputFlags: { ...session.outputFlags, quiet: true } };
  await startAgentRuntime({ session: quietSession, cwd: "C:/work", oneShot: true });
  expect(formatStartupSettings).toHaveBeenCalledTimes(1);
  expect(presentAgentSession).toHaveBeenLastCalledWith(expect.objectContaining({ settings: "" }));
});
