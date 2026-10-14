import { EventEmitter } from "node:events";
import { afterEach, expect, jest, test } from "@jest/globals";

const child = new EventEmitter();
child.pid = 42;
child.unref = jest.fn();
const spawn = jest.fn(() => child);
const persistWorkerRecord = jest.fn(async () => {});
const attachWorkerLifecycle = jest.fn();
const terminateWorkerChildren = jest.fn(async () => "done");
await jest.unstable_mockModule("node:child_process", () => ({ spawn }));
await jest.unstable_mockModule("../src/worker-process-record.mjs", () => ({ persistWorkerRecord }));
await jest.unstable_mockModule("../src/worker-child-lifecycle.mjs", () => ({
  attachWorkerLifecycle,
}));
await jest.unstable_mockModule("../src/worker-shutdown.mjs", () => ({ terminateWorkerChildren }));
const { startWorker, terminateWorkers, workerProcessState } =
  await import("../src/worker-process.mjs");

afterEach(() => {
  workerProcessState.workers.clear();
  workerProcessState.children.clear();
  spawn.mockClear();
  persistWorkerRecord.mockClear();
  attachWorkerLifecycle.mockClear();
  terminateWorkerChildren.mockClear();
  child.removeAllListeners();
});

test("starts a worker with launch identity and lifecycle handlers", async () => {
  const worker = startWorker("task", "/repo", "read-only", true);
  expect(workerProcessState.workers.get(worker.id)).toBe(worker);
  expect(workerProcessState.children.get(worker.id)).toBe(child);
  expect(spawn).toHaveBeenCalledWith(
    process.execPath,
    expect.arrayContaining(["--debug", "--", "task"]),
    expect.objectContaining({
      cwd: "/repo",
      env: expect.objectContaining({ AGENTX_WORKER_ID: worker.id, AGENTX_PERMISSION: "read-only" }),
    }),
  );
  expect(attachWorkerLifecycle).toHaveBeenCalledWith(expect.objectContaining({ child, worker }));
  expect(child.unref).toHaveBeenCalled();
  await Promise.resolve();
});

test("ignores a failed initial record write", async () => {
  persistWorkerRecord.mockRejectedValueOnce(new Error("record unavailable"));
  expect(startWorker("task", "/repo", "execute", false).status).toBe("running");
  await Promise.resolve();
});

test("forwards worker shutdown with shared state and grace period", async () => {
  await expect(terminateWorkers()).resolves.toBe("done");
  expect(terminateWorkerChildren).toHaveBeenCalledWith(
    expect.objectContaining({ state: workerProcessState, graceMs: expect.any(Number) }),
  );
});
