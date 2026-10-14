import { expect, jest, test } from "@jest/globals";
import {
  resolveWorkerCancelTarget,
  workerCancelResult,
} from "../src/parallel-worker-cancel-selection.mjs";

test("selects an active worker and its child", async () => {
  const worker = { id: "active" };
  const child = { kill: jest.fn() };
  const state = { workers: new Map([["active", worker]]), children: new Map([["active", child]]) };
  await expect(
    resolveWorkerCancelTarget("active", "/repo", { state, readRecord: jest.fn() }),
  ).resolves.toEqual({ worker, child });
});

test("reports stored and unknown workers", async () => {
  const state = { workers: new Map(), children: new Map() };
  const readRecord = jest.fn(async (_cwd, id) => (id === "saved" ? { status: "failed" } : null));
  await expect(
    resolveWorkerCancelTarget("saved", "/repo", { state, readRecord }),
  ).resolves.toMatchObject({ result: { id: "saved", status: "failed" } });
  await expect(
    resolveWorkerCancelTarget("missing", "/repo", { state, readRecord }),
  ).resolves.toMatchObject({ result: { id: "missing", status: "unknown" } });
});

test("builds the final worker snapshot", () => {
  expect(
    workerCancelResult({ id: "done", status: "cancelled", startedAt: 1 }, {}, 3),
  ).toMatchObject({ id: "done", status: "cancelled", elapsed_ms: expect.any(Number) });
});
