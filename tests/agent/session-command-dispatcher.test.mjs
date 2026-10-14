import { describe, expect, jest, test } from "@jest/globals";
import { createSessionCommandDispatcher } from "../../src/agent/session-command-dispatcher.mjs";

function harness() {
  const values = {
    activeGoal: null,
    template: { model: "gpt-6-luna" },
    cwd: "C:/repo",
    previousCwd: null,
    cwdNote: "",
  };
  const state = Object.fromEntries(
    Object.keys(values).flatMap((key) => [
      [`get${key[0].toUpperCase()}${key.slice(1)}`, () => values[key]],
      [
        `set${key[0].toUpperCase()}${key.slice(1)}`,
        (value) => {
          values[key] = value;
        },
      ],
    ]),
  );
  state.getSessionUsage = () => ({ turns: 4 });
  state.getHistory = () => [];
  const services = {
    transitionGoalCommand: () => ({ handled: false }),
    runSetup: jest.fn(),
    applySettings: jest.fn(),
    loadPromptTemplate: jest.fn(),
    reloadSettings: jest.fn(),
    write: jest.fn(),
    formatMessage: (message) => message,
    printError: jest.fn(),
    saveState: jest.fn(async () => {}),
    writeSystem: jest.fn(),
    exitWithSummary: jest.fn(),
    printUsageReport: jest.fn(),
    resetState: jest.fn(),
    createUsageTotals: jest.fn(() => ({})),
    clearSession: jest.fn(),
    promptRollback: jest.fn(),
    applyRollback: jest.fn(),
    persistCheckpoint: jest.fn(),
    resolveCdTarget: jest.fn(async (target) => `C:/repo/${target}`),
    buildWorkingDirectoryNote: jest.fn((cwd) => `Changed to ${cwd}`),
  };
  const dispatcher = createSessionCommandDispatcher({
    state,
    context: {
      promptPath: "prompt.json",
      outputFlags: { noUsage: false, noMcp: false },
      input: {},
      output: {},
      statePath: "state.json",
      checkpointPath: "checkpoint.json",
    },
    repl: {
      getReadline: () => ({}),
      preserveHistory: jest.fn(),
      createReadline: jest.fn(),
      setReadline: jest.fn(),
    },
    services,
  });
  return { values, services, dispatcher };
}

describe("session command dispatcher", () => {
  test("routes usage through the report service", async () => {
    const { services, dispatcher } = harness();
    await expect(dispatcher("/usage")).resolves.toEqual({ action: "continue" });
    expect(services.printUsageReport).toHaveBeenCalledWith({ turns: 4 }, { model: "gpt-6-luna" });
  });

  test("applies a handled goal transition to live command state", async () => {
    const { values, services, dispatcher } = harness();
    const goal = { status: "active", text: "ship it" };
    services.transitionGoalCommand = jest.fn(() => ({ handled: true, goal, continue: true }));
    await expect(dispatcher("goal command")).resolves.toEqual({ action: "continue" });
    expect(services.transitionGoalCommand).toHaveBeenCalledWith(null, null);
    expect(values.activeGoal).toBe(goal);
  });

  test("applies directory changes through injected path services", async () => {
    const { values, services, dispatcher } = harness();
    await expect(dispatcher("cd child")).resolves.toEqual({ action: "continue" });
    expect(services.resolveCdTarget).toHaveBeenCalledWith("child", "C:/repo", {
      previousCwd: null,
    });
    expect(values.cwd).toBe("C:/repo/child");
    expect(values.previousCwd).toBe("C:/repo");
    expect(values.cwdNote).toBe("Changed to C:/repo/child");
  });

  test("delegates setup and installs the reloaded template", async () => {
    const { values, services, dispatcher } = harness();
    const template = { model: "updated-model" };
    services.loadPromptTemplate.mockResolvedValue({ model: "loaded" });
    services.applySettings.mockReturnValue(template);
    await expect(dispatcher("/setup")).resolves.toEqual({ action: "continue" });
    expect(services.runSetup).toHaveBeenCalledWith({ stdin: {}, stdout: {} });
    expect(services.loadPromptTemplate).toHaveBeenCalledWith(
      "prompt.json",
      undefined,
      process.env,
      {
        loadMcp: true,
      },
    );
    expect(values.template).toBe(template);
  });

  test("delegates rollback with current history", async () => {
    const { services, dispatcher } = harness();
    services.promptRollback.mockResolvedValue(null);
    await expect(dispatcher("/rollback")).resolves.toEqual({ action: "continue" });
    expect(services.promptRollback).toHaveBeenCalledWith([], expect.any(Object));
    expect(services.applyRollback).not.toHaveBeenCalled();
  });
});
