import { expect, jest, test } from "@jest/globals";

test("builds the rollback workflow adapter from session services", async () => {
  await jest.isolateModulesAsync(async () => {
    const runSessionRollbackFlow = jest.fn(async () => "rollback result");
    await jest.unstable_mockModule("../../src/agent/session-rollback-flow.mjs", () => ({
      runSessionRollbackFlow,
    }));
    const { createSessionCommandRollbackAdapter } =
      await import("../../src/agent/session-command-rollback-adapter.mjs");
    const state = { getHistory: jest.fn(() => [{ response_id: "saved" }]) };
    const services = {
      promptRollback: jest.fn(),
      applyRollback: jest.fn(),
      saveState: jest.fn(),
      persistCheckpoint: jest.fn(),
      write: jest.fn(),
      formatMessage: jest.fn(),
    };
    const repl = {
      getReadline: jest.fn(() => "readline"),
      preserveHistory: jest.fn(),
      createReadline: jest.fn(),
      setReadline: jest.fn(),
    };
    const context = { checkpointPath: "checkpoint.json", input: "stdin", output: "stdout" };
    const runRollbackFlow = createSessionCommandRollbackAdapter({ state, services, repl, context });
    await expect(runRollbackFlow()).resolves.toBe("rollback result");
    expect(runSessionRollbackFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        history: [{ response_id: "saved" }],
        checkpointPath: "checkpoint.json",
        input: "stdin",
        output: "stdout",
      }),
    );
    expect(state.getHistory).toHaveBeenCalledTimes(1);
    expect(repl.getReadline).toHaveBeenCalledTimes(1);
  });
});
