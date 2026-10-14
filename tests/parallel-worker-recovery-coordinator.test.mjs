import { expect, jest, test } from "@jest/globals";

test("connects persisted worker storage to process-state recovery", async () => {
  await jest.isolateModulesAsync(async () => {
    const cleanupWorkerRecords = jest.fn();
    const listWorkerRecords = jest.fn();
    const readWorkerLog = jest.fn();
    const persistWorker = jest.fn();
    const workers = new Map();
    const state = { workers };
    const recoverWorkers = jest.fn();
    await jest.unstable_mockModule("../src/worker-registry.mjs", () => ({
      cleanupWorkerRecords,
      listWorkerRecords,
      readWorkerLog,
    }));
    await jest.unstable_mockModule("../src/worker-process.mjs", () => ({
      workerProcessState: state,
      persistWorker,
    }));
    await jest.unstable_mockModule("../src/parallel-worker-recovery.mjs", () => ({
      recoverWorkers,
    }));
    const { recoverParallelWorkers } =
      await import("../src/parallel-worker-recovery-coordinator.mjs");
    recoverParallelWorkers("/repo");
    expect(recoverWorkers).toHaveBeenCalledWith("/repo", {
      cleanup: cleanupWorkerRecords,
      list: listWorkerRecords,
      readLog: readWorkerLog,
      persist: persistWorker,
      state,
    });
  });
});
