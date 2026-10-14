import { expect, jest, test } from "@jest/globals";
import { cancelLiveWorkerProcess } from "../src/parallel-worker-live-cancel.mjs";

test("persists the live worker cancellation state before signalling its child", async () => {
  const worker = { status: "running" };
  const events = [];
  const persist = jest.fn(async () => events.push("persist"));
  const child = { kill: jest.fn((signal) => events.push(signal)) };
  await cancelLiveWorkerProcess(worker, child, persist);
  expect(worker).toMatchObject({ status: "cancelled", error: "cancelled by request" });
  expect(worker.finishedAt).toEqual(expect.any(Number));
  expect(persist).toHaveBeenCalledWith(worker);
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  expect(events).toEqual(["persist", "SIGTERM"]);
});
