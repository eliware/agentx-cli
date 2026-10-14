import { expect, jest, test } from "@jest/globals";
import { spawnWorker } from "../src/parallel-worker-spawn.mjs";

test("starts a worker and reports its state", async () => {
  const start = jest.fn(() => ({ id: "a", status: "running", startedAt: Date.now() }));
  const result = await spawnWorker({ task: "work" }, "/workspace", {}, start);
  expect(start).toHaveBeenCalledWith("work", "/workspace", "execute", false, undefined, undefined);
  expect(result.agent).toMatchObject({ id: "a", status: "running" });
});

test("uses execute permission when the requested permission is invalid", async () => {
  const start = jest.fn(() => ({ id: "invalid-permission", status: "running" }));
  await spawnWorker({ task: "work", permissions: "admin" }, "/repo", {}, start);
  expect(start).toHaveBeenCalledWith("work", "/repo", "execute", false, undefined, undefined);
});

test("passes a supported permission to the worker starter", async () => {
  const start = jest.fn(() => ({ id: "read", status: "running" }));
  await spawnWorker({ task: "work", permissions: "read" }, "/repo", {}, start);
  expect(start.mock.calls[0][2]).toBe("read");
});

test("waits for a running worker until the requested deadline", async () => {
  jest.useFakeTimers();
  try {
    const start = jest.fn(() => ({ id: "b", status: "running", startedAt: Date.now() }));
    const resultPromise = spawnWorker({ task: "wait", wait_ms: 100 }, "/workspace", {}, start);

    await jest.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toMatchObject({ waited_ms: 100, timed_out: true });
  } finally {
    jest.useRealTimers();
  }
});

test("rejects invalid and nested worker requests before launch", async () => {
  const start = jest.fn();
  await expect(spawnWorker({ task: 4 }, "/repo", {}, start)).resolves.toEqual({
    error: "task must be a non-empty string",
  });
  const oldWorkerId = process.env.AGENTX_WORKER_ID;
  process.env.AGENTX_WORKER_ID = "parent";
  try {
    await expect(spawnWorker({ task: "child" }, "/repo", {}, start)).resolves.toEqual({
      error: "nested worker spawning is disabled",
    });
  } finally {
    if (oldWorkerId === undefined) delete process.env.AGENTX_WORKER_ID;
    else process.env.AGENTX_WORKER_ID = oldWorkerId;
  }
  expect(start).not.toHaveBeenCalled();
});
