import { EventEmitter } from "node:events";
import { expect, jest, test } from "@jest/globals";
import { attachWorkerLifecycle } from "../src/worker-child-lifecycle.mjs";

test("finalizes a child on close", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  const worker = { id: "agent-1", cwd: "/repo", status: "running", output: "", lines: 0 };
  const persistWorker = jest.fn().mockResolvedValue(undefined);
  const onComplete = jest.fn();
  attachWorkerLifecycle({
    child,
    worker,
    state: { children: new Map([[worker.id, child]]) },
    persistWorker,
    onComplete,
    timeoutMs: 100000,
    shutdownGraceMs: 10,
  });
  child.emit("close", 0, null);
  expect(worker.status).toBe("completed");
  expect(onComplete).toHaveBeenCalledWith(worker);
});

test.each([
  ["failed", 1, null, "failed"],
  ["cancelled", 0, null, "cancelled"],
  ["timed_out", null, "SIGTERM", "timed_out"],
])("keeps the %s state when the child closes", (initial, code, signal, expected) => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  const worker = { id: initial, cwd: "/repo", status: initial, output: "", lines: 0 };
  attachWorkerLifecycle({
    child,
    worker,
    state: { children: new Map([[worker.id, child]]) },
    persistWorker: jest.fn().mockResolvedValue(undefined),
    timeoutMs: 100000,
    shutdownGraceMs: 10,
  });
  child.emit("close", code, signal);
  expect(worker.status).toBe(expected);
});

test("records a child error", () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  const worker = { id: "timeout", cwd: "/repo", status: "running", output: "", lines: 0 };
  const persistWorker = jest.fn().mockResolvedValue(undefined);
  attachWorkerLifecycle({
    child,
    worker,
    state: { children: new Map([[worker.id, child]]) },
    persistWorker,
    timeoutMs: 100000,
    shutdownGraceMs: 10,
  });
  child.emit("error", new Error("spawn failed"));
  expect(worker.status).toBe("failed");
  expect(worker.error).toBe("spawn failed");
});

test("escalates a timed-out child and preserves its timeout state on close", async () => {
  jest.useFakeTimers();
  try {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();
    const worker = { id: "timed-close", cwd: "/repo", status: "running", output: "", lines: 0 };
    const state = { children: new Map([[worker.id, child]]) };
    const persistWorker = jest.fn().mockRejectedValue(new Error("disk unavailable"));
    const complete = jest.fn();
    attachWorkerLifecycle({
      child,
      worker,
      state,
      persistWorker,
      onComplete: complete,
      timeoutMs: 5,
      shutdownGraceMs: 10,
    });
    await jest.advanceTimersByTimeAsync(15);
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    child.emit("close", null, "SIGTERM");
    expect(worker.signal).toBe("SIGTERM");
    expect(state.children.has(worker.id)).toBe(false);
    expect(complete).toHaveBeenCalledWith(worker);
    child.emit("close", 0, null);
    await Promise.resolve();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(persistWorker).toHaveBeenCalledWith(worker);
  } finally {
    jest.useRealTimers();
  }
});
