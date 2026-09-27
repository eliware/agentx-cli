import { describe, expect, jest, test } from "@jest/globals";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareAgentSession } from "../../src/agent/session-bootstrap.mjs";

function dependencies(overrides = {}) {
  return {
    resolvePath: (cwd, name) => `${cwd}/${name}`,
    cleanupStaleOneShotStates: jest.fn(async () => {}),
    readLatestCheckpoint: jest.fn(async () => null),
    readSessionState: jest.fn(async () => null),
    parseCliArgs: jest.fn(() => ({ flags: { quiet: false } })),
    normalizeOutputFlags: jest.fn((flags) => flags),
    loadPromptTemplate: jest.fn(async () => ({ base: true })),
    applySettings: jest.fn((template) => ({ ...template, configured: true })),
    settingsFromEnv: jest.fn(() => ({ model: "test-model" })),
    readAgentsFromCwdAndParents: jest.fn(async () => "instructions"),
    createUsageTotals: jest.fn(() => ({ turns: 0 })),
    restoreSessionState: jest.fn((savedState) => ({ restored: savedState })),
    resolveAgentApiKey: jest.fn(() => "resolved-key"),
    ...overrides,
  };
}

describe("agent session bootstrap", () => {
  test("prepares an interactive session from flags, settings, saved state, and env", async () => {
    const savedState = { response_id: "resp-saved" };
    const deps = dependencies({
      parseCliArgs: jest.fn(() => ({ flags: { quiet: false, noMcp: true } })),
      readSessionState: jest.fn(async () => savedState),
    });
    const env = { agentx_api_key: "local-key", AGENTX_MODEL: "gpt-6-luna" };

    const session = await prepareAgentSession(
      {
        promptPath: "prompt.json",
        cwd: "C:/project",
        flags: { quiet: true },
        argv: ["--no-mcp"],
        env,
        pid: 41,
        now: 123,
      },
      deps,
    );

    expect(session).toMatchObject({
      outputFlags: { quiet: true, noMcp: true },
      statePath: "C:/project/.agentx_responseid",
      checkpointPath: "C:/project/.agentx_checkpoint",
      savedState,
      savedResponseId: "resp-saved",
      apiKey: "local-key",
      agentsText: "instructions",
      template: { base: true, configured: true },
    });
    expect(deps.cleanupStaleOneShotStates).toHaveBeenCalledWith("C:/project", 123);
    expect(deps.loadPromptTemplate).toHaveBeenCalledWith("prompt.json", undefined, env, {
      loadMcp: false,
    });
    expect(deps.settingsFromEnv).toHaveBeenCalledWith(env);
    expect(deps.restoreSessionState).toHaveBeenCalledWith(savedState, deps.createUsageTotals);
    expect(deps.resolveAgentApiKey).not.toHaveBeenCalled();
  });

  test("uses the checkpoint and isolates one-shot state with a deterministic suffix", async () => {
    const checkpoint = { response_id: "resp-checkpoint" };
    const deps = dependencies({ readLatestCheckpoint: jest.fn(async () => checkpoint) });

    const session = await prepareAgentSession(
      {
        promptPath: "prompt.json",
        cwd: "/workspace",
        oneShot: true,
        env: { AGENTX_API_KEY: "environment-key" },
        pid: 52,
        now: 987,
      },
      deps,
    );

    expect(session.statePath).toBe("/workspace/.agentx_responseid.oneshot-52-987");
    expect(session.savedState).toBe(checkpoint);
    expect(session.savedResponseId).toBe("resp-checkpoint");
    expect(session.apiKey).toBe("environment-key");
    expect(deps.readLatestCheckpoint).toHaveBeenCalledWith(
      "/workspace/.agentx_checkpoint",
      "/workspace/.agentx_responseid",
    );
    expect(deps.readSessionState).not.toHaveBeenCalled();
    expect(deps.loadPromptTemplate).toHaveBeenCalledWith(
      "prompt.json",
      undefined,
      {
        AGENTX_API_KEY: "environment-key",
      },
      { loadMcp: true },
    );

    const noCheckpoint = await prepareAgentSession(
      {
        promptPath: "prompt.json",
        cwd: "/workspace",
        oneShot: true,
        env: { AGENTX_API_KEY: "environment-key" },
      },
      dependencies(),
    );
    expect(noCheckpoint.savedState).toBeNull();
  });

  test.each([
    [{ JEST_WORKER_ID: "1" }, "test-key", false],
    [{}, "resolved-key", true],
  ])("resolves the fallback API key for %j", async (env, expectedKey, shouldResolve) => {
    const deps = dependencies();
    const session = await prepareAgentSession(
      { promptPath: "prompt.json", cwd: "/project", env },
      deps,
    );

    expect(session.apiKey).toBe(expectedKey);
    expect(deps.resolveAgentApiKey).toHaveBeenCalledTimes(Number(shouldResolve));
  });

  test("adds the working directory to AGENTS.md load failures", async () => {
    const deps = dependencies({
      readAgentsFromCwdAndParents: jest.fn(async () => {
        throw new Error("permission denied");
      }),
    });

    await expect(
      prepareAgentSession({ promptPath: "prompt.json", cwd: "/private/project", env: {} }, deps),
    ).rejects.toThrow("Unable to read AGENTS.md files under /private/project: permission denied");
    expect(deps.readSessionState).not.toHaveBeenCalled();
  });

  test("stringifies AGENTS.md failures without a message", async () => {
    const deps = dependencies({
      readAgentsFromCwdAndParents: jest.fn(async () => {
        throw {};
      }),
    });

    await expect(
      prepareAgentSession({ promptPath: "prompt.json", cwd: "/project", env: {} }, deps),
    ).rejects.toThrow("Unable to read AGENTS.md files under /project: [object Object]");
  });

  test("uses the default dependencies and runtime inputs in a temporary directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentx-session-bootstrap-"));
    const previous = {
      workerId: process.env.JEST_WORKER_ID,
      lowerKey: process.env.agentx_api_key,
      upperKey: process.env.AGENTX_API_KEY,
    };
    process.env.JEST_WORKER_ID = "bootstrap-test";
    delete process.env.agentx_api_key;
    delete process.env.AGENTX_API_KEY;
    try {
      const session = await prepareAgentSession({
        promptPath: fileURLToPath(new URL("../../prompt.json", import.meta.url)),
        cwd: directory,
        oneShot: true,
        flags: { noMcp: true },
        argv: [],
      });

      expect(session.apiKey).toBe("test-key");
      expect(session.statePath).toMatch(/\.agentx_responseid\.oneshot-\d+-\d+$/u);
      expect(session.savedState).toBeNull();
      expect(session.template.model).toBeTruthy();
    } finally {
      if (previous.workerId === undefined) delete process.env.JEST_WORKER_ID;
      else process.env.JEST_WORKER_ID = previous.workerId;
      if (previous.lowerKey === undefined) delete process.env.agentx_api_key;
      else process.env.agentx_api_key = previous.lowerKey;
      if (previous.upperKey === undefined) delete process.env.AGENTX_API_KEY;
      else process.env.AGENTX_API_KEY = previous.upperKey;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
