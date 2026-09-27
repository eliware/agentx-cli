import { describe, expect, jest, test } from "@jest/globals";
import { routeSessionCommand } from "../../src/agent/session-command-router.mjs";

function createRouter({ internal = null, message = "hello", noUsage = false, ...overrides } = {}) {
  const state = {
    activeGoal: null,
    template: { model: "test-model" },
    cwd: "/work",
    previousCwd: null,
    cwdNote: "",
  };
  const deps = {
    transitionGoalCommand: jest.fn(() => ({ handled: false })),
    runSetupFlow: jest.fn(async () => ({ model: "reloaded" })),
    saveState: jest.fn(),
    writeSystem: jest.fn(),
    exitWithSummary: jest.fn(),
    noUsage,
    printUsageReport: jest.fn(),
    getSessionUsage: jest.fn(() => "usage"),
    resetState: jest.fn(),
    createUsageTotals: jest.fn(() => "empty usage"),
    clearSession: jest.fn(),
    statePath: "session.json",
    runRollbackFlow: jest.fn(),
    resolveCdTarget: jest.fn(async (target) => `/work/${target}`),
    buildWorkingDirectoryNote: jest.fn((cwd) => `changed to ${cwd}`),
    ...overrides,
  };
  return {
    state,
    deps,
    route: (nextInternal = internal, nextMessage = message) =>
      routeSessionCommand({ internal: nextInternal, message: nextMessage, state, deps }),
  };
}

describe("session command router", () => {
  test("runs setup and updates the active prompt template", async () => {
    const router = createRouter({ internal: { type: "setup" } });
    await expect(router.route()).resolves.toEqual({ action: "continue" });
    expect(router.state.template).toEqual({ model: "reloaded" });
  });

  test("persists goal transitions, emits messages, and routes transformed goal input", async () => {
    const router = createRouter({
      internal: { type: "goal" },
      transitionGoalCommand: jest.fn(() => ({
        handled: true,
        goal: { status: "active" },
        persist: true,
        message: "Goal started",
        inputMessage: "do the work",
      })),
    });
    await expect(router.route()).resolves.toEqual({ action: "request", message: "do the work" });
    expect(router.state.activeGoal).toEqual({ status: "active" });
    expect(router.deps.saveState).toHaveBeenCalledTimes(1);
    expect(router.deps.writeSystem).toHaveBeenCalledWith("Goal started");
  });

  test("continues without a request when a goal command asks to continue", async () => {
    const router = createRouter({
      internal: { type: "goal" },
      transitionGoalCommand: jest.fn(() => ({ handled: true, goal: null, continue: true })),
    });
    await expect(router.route()).resolves.toEqual({ action: "continue" });
  });

  test("routes exit and session-clear lifecycle operations", async () => {
    const exiting = createRouter({ internal: { type: "exit" } });
    await expect(exiting.route()).resolves.toEqual({ action: "exit" });
    expect(exiting.deps.exitWithSummary).toHaveBeenCalledTimes(1);

    const clearing = createRouter({ internal: { type: "session_clear" } });
    await expect(clearing.route()).resolves.toEqual({ action: "continue" });
    expect(clearing.deps.resetState).toHaveBeenCalledWith("empty usage");
    expect(clearing.deps.clearSession).toHaveBeenCalledWith("session.json");
    expect(clearing.deps.writeSystem).toHaveBeenCalledWith("Session cleared");

    const quietClear = createRouter({ internal: { type: "session_clear" }, noUsage: true });
    await quietClear.route();
    expect(quietClear.deps.printUsageReport).not.toHaveBeenCalled();
  });

  test("routes rollback and usage commands with their output policy", async () => {
    const rollback = createRouter({ internal: { type: "rollback" } });
    await expect(rollback.route()).resolves.toEqual({ action: "continue" });
    expect(rollback.deps.runRollbackFlow).toHaveBeenCalledTimes(1);

    const usage = createRouter({ internal: { type: "usage" } });
    await usage.route();
    expect(usage.deps.printUsageReport).toHaveBeenCalledWith("usage", { model: "test-model" });

    const quietUsage = createRouter({ internal: { type: "usage" }, noUsage: true });
    await quietUsage.route();
    expect(quietUsage.deps.printUsageReport).not.toHaveBeenCalled();
  });

  test("changes directories and reports path failures without ending the prompt loop", async () => {
    const changed = createRouter({
      internal: { type: "cd", target: "child" },
      cwd: "/work",
    });
    await expect(changed.route()).resolves.toEqual({ action: "continue" });
    expect(changed.state.cwd).toBe("/work/child");
    expect(changed.state.previousCwd).toBe("/work");
    expect(changed.state.cwdNote).toBe("changed to /work/child");

    const failed = createRouter({
      internal: { type: "cd", target: "missing" },
      resolveCdTarget: jest.fn(async () => {
        throw new Error("not a directory");
      }),
    });
    await failed.route();
    expect(failed.deps.writeSystem).toHaveBeenCalledWith("not a directory");
    expect(failed.state.cwd).toBe("/work");

    const unknownError = createRouter({
      internal: { type: "cd", target: "missing" },
      resolveCdTarget: jest.fn(async () => {
        throw "path failure";
      }),
    });
    await unknownError.route();
    expect(unknownError.deps.writeSystem).toHaveBeenCalledWith("path failure");
  });

  test("returns ordinary user messages for the request lifecycle", async () => {
    const router = createRouter();
    await expect(router.route()).resolves.toEqual({ action: "request", message: "hello" });
  });
});
