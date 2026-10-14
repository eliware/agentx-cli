import { afterEach, expect, jest, test } from "@jest/globals";
import { getWorkerStatus } from "../src/parallel-worker-status.mjs";

afterEach(() => jest.useRealTimers());

test("reports unknown workers and filters invalid IDs", async () => {
  await expect(
    getWorkerStatus({ agent_ids: ["missing", "", 5] }, { workers: new Map() }),
  ).resolves.toMatchObject({ agents: [{ id: "missing", status: "unknown" }], timed_out: false });
});

test("returns worker snapshots and bounds the reported wait", async () => {
  const worker = {
    id: "agent-1",
    task: "task",
    status: "completed",
    pid: 4,
    cwd: "/repo",
    startedAt: 10,
    finishedAt: 20,
    lines: 2,
    output: "result",
    usage: { turns: 1 },
    error: "none",
  };
  const state = { workers: new Map([[worker.id, worker]]) };
  await expect(
    getWorkerStatus({ agent_ids: [worker.id], wait_ms: 200000 }, state),
  ).resolves.toMatchObject({
    agents: [{ id: worker.id, elapsed_ms: 10, lines: 2, usage: { turns: 1 }, error: "none" }],
    waited_ms: 180000,
    timed_out: false,
  });
  await expect(
    getWorkerStatus({ agent_ids: [worker.id], wait_ms: "invalid" }, state),
  ).resolves.toMatchObject({
    waited_ms: 0,
    timed_out: false,
  });
});

test("waits for a worker that has not reached a terminal status", async () => {
  jest.useFakeTimers();
  const state = { workers: new Map([["agent-1", { id: "agent-1", status: "running" }]]) };
  const pending = getWorkerStatus({ agent_ids: ["agent-1"], wait_ms: 1 }, state);
  await jest.advanceTimersByTimeAsync(100);
  await expect(pending).resolves.toMatchObject({ waited_ms: 1, timed_out: true });
});
