import { expect, jest, test } from "@jest/globals";
import { markMissingWorkerProcess } from "../src/parallel-worker-liveness.mjs";

test("keeps recovered workers active when their process exists", async () => {
  const worker = { pid: 123, status: "running" };
  const persist = jest.fn();
  await expect(markMissingWorkerProcess(worker, persist, jest.fn())).resolves.toBe(false);
  expect(worker.status).toBe("running");
  expect(persist).not.toHaveBeenCalled();
});

test("marks and persists recovered workers when their process is missing", async () => {
  const worker = { pid: 123, status: "running" };
  const persist = jest.fn();
  const check = jest.fn(() => {
    throw new Error("missing");
  });
  await expect(markMissingWorkerProcess(worker, persist, check)).resolves.toBe(true);
  expect(check).toHaveBeenCalledWith(123, 0);
  expect(worker).toMatchObject({ status: "failed", error: "worker process no longer exists" });
  expect(worker.finishedAt).toEqual(expect.any(Number));
  expect(persist).toHaveBeenCalledWith(worker);
});
