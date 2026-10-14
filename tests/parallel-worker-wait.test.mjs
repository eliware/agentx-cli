import { expect, jest, test } from "@jest/globals";
import { waitForWorker } from "../src/parallel-worker-wait.mjs";

test("skips polling when the requested wait is zero", async () => {
  const shouldWait = jest.fn(() => true);
  await expect(waitForWorker(0, shouldWait)).resolves.toBe(false);
  expect(shouldWait).not.toHaveBeenCalled();
});

test("stops polling when a worker completes", async () => {
  jest.useFakeTimers();
  try {
    const shouldWait = jest.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const waiting = waitForWorker(500, shouldWait);
    await jest.advanceTimersByTimeAsync(100);
    await expect(waiting).resolves.toBe(false);
    expect(shouldWait).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

test("reports a worker that remains active at the deadline", async () => {
  jest.useFakeTimers();
  try {
    const shouldWait = jest.fn(() => true);
    const waiting = waitForWorker(100, shouldWait);
    await jest.advanceTimersByTimeAsync(100);
    await expect(waiting).resolves.toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
