import { expect, jest, test } from "@jest/globals";

const cancelRecoveredWorkerProcess = jest.fn(async () => {});
const cancelLiveWorkerProcess = jest.fn(async () => {});
await jest.unstable_mockModule("../src/parallel-worker-process-cancel.mjs", () => ({
  cancelRecoveredWorkerProcess,
}));
await jest.unstable_mockModule("../src/parallel-worker-live-cancel.mjs", () => ({
  cancelLiveWorkerProcess,
}));
const { cancelWorkers } = await import("../src/parallel-worker-cancel.mjs");

test("reports unknown workers with or without a stored record", async () => {
  const result = await cancelWorkers({ agent_ids: ["missing", "untracked"] }, "/workspace", {
    state: { workers: new Map(), children: new Map() },
    readRecord: async (_cwd, id) => (id === "missing" ? { status: "failed" } : null),
    persist: jest.fn(),
  });
  expect(result.agents).toEqual([
    { id: "missing", status: "failed" },
    { id: "untracked", status: "unknown" },
  ]);
});

test("cancels live and recovered processes only when they can run", async () => {
  const live = { id: "live", status: "running", startedAt: Date.now() };
  const recovered = { id: "saved", status: "timed_out", pid: 321, startedAt: Date.now() };
  const settled = { id: "done", status: "completed", pid: 123, startedAt: Date.now() };
  const state = {
    workers: new Map([
      [live.id, live],
      [recovered.id, recovered],
      [settled.id, settled],
    ]),
    children: new Map([[live.id, { kill: jest.fn() }]]),
  };
  const persist = jest.fn();
  const result = await cancelWorkers({ agent_ids: ["live", "saved", "done"] }, "/repo", {
    state,
    readRecord: jest.fn(),
    persist,
  });
  expect(cancelLiveWorkerProcess).toHaveBeenCalledWith(live, state.children.get("live"), persist);
  expect(cancelRecoveredWorkerProcess).toHaveBeenCalledWith(recovered, persist);
  expect(result.agents.map(({ status }) => status)).toEqual(["running", "timed_out", "completed"]);
});

test("ignores non-string and blank identifiers", async () => {
  await expect(
    cancelWorkers({ agent_ids: ["", null, 4] }, "/repo", {
      state: { workers: new Map(), children: new Map() },
      readRecord: jest.fn(),
      persist: jest.fn(),
    }),
  ).resolves.toEqual({ agents: [] });
  await expect(
    cancelWorkers({}, "/repo", {
      state: { workers: new Map(), children: new Map() },
      readRecord: jest.fn(),
      persist: jest.fn(),
    }),
  ).resolves.toEqual({ agents: [] });
});
