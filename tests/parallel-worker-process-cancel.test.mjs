import { describe, expect, jest, test } from "@jest/globals";
import { cancelRecoveredWorkerProcess } from "../src/parallel-worker-process-cancel.mjs";

describe("recovered worker process cancellation", () => {
  test("marks and persists a worker after SIGTERM succeeds", async () => {
    const worker = { pid: 123, status: "running" };
    const persist = jest.fn();
    const signal = jest.fn();
    await cancelRecoveredWorkerProcess(worker, persist, signal);
    expect(signal).toHaveBeenCalledWith(123, "SIGTERM");
    expect(worker).toMatchObject({ status: "cancelled", error: "cancelled by request" });
    expect(persist).toHaveBeenCalledWith(worker);
  });

  test("marks and persists a worker when its process no longer exists", async () => {
    const worker = { pid: 123, status: "running" };
    const persist = jest.fn();
    const signal = jest.fn(() => {
      throw Object.assign(new Error("missing"), { code: "ESRCH" });
    });
    await cancelRecoveredWorkerProcess(worker, persist, signal);
    expect(worker).toMatchObject({ status: "failed", error: "worker process no longer exists" });
    expect(persist).toHaveBeenCalledWith(worker);
  });

  test("keeps worker state when the operating system denies SIGTERM", async () => {
    const worker = { pid: 123, status: "running" };
    const persist = jest.fn();
    const signal = jest.fn(() => {
      throw Object.assign(new Error("denied"), { code: "EPERM" });
    });
    await cancelRecoveredWorkerProcess(worker, persist, signal);
    expect(worker).toEqual({ pid: 123, status: "running" });
    expect(persist).not.toHaveBeenCalled();
  });
});
