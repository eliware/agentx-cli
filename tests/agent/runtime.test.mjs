import { expect, jest, test } from "@jest/globals";

const clearSession = jest.fn();
const persistCheckpoint = jest.fn();
const prepareAgentSession = jest.fn();
const setActiveClient = jest.fn();
const runAgentPromptSession = jest.fn(async () => "prompt result");
const startAgentRuntime = jest.fn();
const setupAgentRuntimeRecovery = jest.fn();
const createAgentRuntimeSessionContext = jest.fn(() => ({ sessionContext: true }));
const lifecycle = { setActiveClient, signalRegistration: "signals" };

await jest.unstable_mockModule("../../src/conversation-state.mjs", () => ({ clearSession }));
await jest.unstable_mockModule("../../src/conversation-checkpoint.mjs", () => ({
  persistCheckpoint,
}));
await jest.unstable_mockModule("../../src/agent/session-bootstrap.mjs", () => ({
  prepareAgentSession,
}));
await jest.unstable_mockModule("../../src/agent/process-lifecycle.mjs", () => ({
  agentProcessLifecycle: lifecycle,
}));
await jest.unstable_mockModule("../../src/agent/runtime-prompt-session.mjs", () => ({
  runAgentPromptSession,
}));
await jest.unstable_mockModule("../../src/agent/runtime-startup.mjs", () => ({
  startAgentRuntime,
}));
await jest.unstable_mockModule("../../src/agent/runtime-session-context.mjs", () => ({
  createAgentRuntimeSessionContext,
}));
await jest.unstable_mockModule("../../src/agent/runtime-recovery-setup.mjs", () => ({
  setupAgentRuntimeRecovery,
}));

const { runAgent } = await import("../../src/agent/runtime.mjs");

test("starts session services before the prompt session", async () => {
  const session = { outputFlags: {}, checkpointPath: "checkpoint", statePath: "state" };
  const runtimeState = { openai: "client" };
  const repl = {};
  const runtimeServices = { saveState: jest.fn() };
  prepareAgentSession.mockResolvedValue(session);
  startAgentRuntime.mockResolvedValue({ runtimeState, repl, agentsText: "rules" });
  setupAgentRuntimeRecovery.mockResolvedValue(runtimeServices);

  await expect(runAgent({ cwd: "/repo" })).resolves.toBe("prompt result");
  expect(prepareAgentSession).toHaveBeenCalledWith({
    promptPath: undefined,
    cwd: "/repo",
    oneShot: false,
    flags: null,
  });
  expect(startAgentRuntime).toHaveBeenCalledWith(
    expect.objectContaining({ session, cwd: "/repo", oneShot: false }),
  );
  expect(setupAgentRuntimeRecovery).toHaveBeenCalledWith(
    expect.objectContaining({ session, runtimeState, cwd: "/repo", repl }),
  );
  expect(createAgentRuntimeSessionContext).toHaveBeenCalledWith(
    expect.objectContaining({
      session,
      runtimeState,
      runtimeServices: expect.objectContaining({
        ...runtimeServices,
        persistCheckpoint,
        clearSession,
      }),
      processLifecycle: lifecycle,
    }),
  );
  expect(runAgentPromptSession).toHaveBeenCalledWith({ sessionContext: true });
});

test("uses default options when no runtime arguments are passed", async () => {
  await expect(runAgent()).resolves.toBe("prompt result");
  expect(prepareAgentSession).toHaveBeenCalledWith({
    promptPath: undefined,
    cwd: undefined,
    oneShot: false,
    flags: null,
  });
});
