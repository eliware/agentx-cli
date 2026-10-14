import { expect, jest, test } from "@jest/globals";
import { requestWorkerCancellation } from "../src/worker-child-cancellation.mjs";

test("records shutdown cancellation before signaling an active child", async () => {
  const order = [];
  const worker = { id: "shutdown", status: "running" };
  const child = { kill: jest.fn((signal) => order.push(signal)) };
  const persistWorker = jest.fn(async () => order.push("persisted"));
  await requestWorkerCancellation({ worker, child, persistWorker });
  expect(worker).toMatchObject({ status: "cancelled", error: "parent shutdown" });
  expect(worker.finishedAt).toEqual(expect.any(Number));
  expect(order).toEqual(["persisted", "SIGTERM"]);
});

test("continues to signal when persistence fails", async () => {
  const child = { kill: jest.fn() };
  const persistWorker = jest.fn().mockRejectedValue(new Error("disk unavailable"));
  await requestWorkerCancellation({
    worker: { id: "active", status: "running" },
    child,
    persistWorker,
  });
  expect(persistWorker).toHaveBeenCalledTimes(1);
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
});
