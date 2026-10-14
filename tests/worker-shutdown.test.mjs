import { expect, jest, test } from "@jest/globals";
import { terminateWorkerChildren } from "../src/worker-shutdown.mjs";

test("terminates active children with escalation", async () => {
  const child = { kill: jest.fn(), killed: false };
  const worker = { id: "a1", status: "running" };
  const persistWorker = jest.fn().mockResolvedValue(undefined);
  await terminateWorkerChildren({
    state: { children: new Map([["a1", child]]), workers: new Map([["a1", worker]]) },
    persistWorker,
    graceMs: 1,
  });
  expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
  expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  expect(worker.status).toBe("cancelled");
});

test("skips terminal workers and already killed children", async () => {
  const terminal = { id: "done", status: "completed" };
  const child = {
    kill: jest.fn(() => {
      throw new Error("already closed");
    }),
    killed: true,
  };
  const persistWorker = jest.fn();
  await terminateWorkerChildren({
    state: {
      children: new Map([[terminal.id, child]]),
      workers: new Map([[terminal.id, terminal]]),
    },
    persistWorker,
    graceMs: 0,
  });
  expect(persistWorker).not.toHaveBeenCalled();
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  expect(child.kill).toHaveBeenCalledTimes(1);
});

test("handles children without worker records", async () => {
  const child = { kill: jest.fn(), killed: true };
  await terminateWorkerChildren({
    state: { children: new Map([["orphan", child]]), workers: new Map() },
    persistWorker: jest.fn(),
    graceMs: 0,
  });
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  expect(child.kill).toHaveBeenCalledTimes(1);
});

test("continues shutdown when worker persistence fails", async () => {
  const child = { kill: jest.fn(), killed: true };
  await terminateWorkerChildren({
    state: {
      children: new Map([["active", child]]),
      workers: new Map([["active", { id: "active", status: "running" }]]),
    },
    persistWorker: jest.fn().mockRejectedValue(new Error("disk unavailable")),
    graceMs: 0,
  });
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  expect(child.kill).toHaveBeenCalledTimes(1);
});
