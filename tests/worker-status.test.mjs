import { describe, expect, test } from "@jest/globals";
import { isWorkerTerminal, normalizeWorkerWait, snapshotWorker } from "../src/worker-status.mjs";

describe("worker status policies", () => {
  test("classifies terminal and active worker states", () => {
    for (const status of ["completed", "failed", "timed_out", "terminated", "cancelled", "unknown"])
      expect(isWorkerTerminal(status)).toBe(true);
    for (const status of ["running", "starting", "", null, undefined])
      expect(isWorkerTerminal(status)).toBe(false);
  });

  test("normalizes wait bounds and invalid values", () => {
    expect(normalizeWorkerWait()).toBe(0);
    expect(normalizeWorkerWait(null)).toBe(0);
    expect(normalizeWorkerWait("not-a-number")).toBe(0);
    expect(normalizeWorkerWait(-20)).toBe(0);
    expect(normalizeWorkerWait(42)).toBe(42);
    expect(normalizeWorkerWait(999999)).toBe(180000);
  });

  test("formats a snapshot using the current time, bounded output, and optional error", () => {
    const worker = {
      id: "agent-1",
      task: "inspect",
      status: "running",
      pid: 41,
      cwd: "/work",
      startedAt: 100,
      finishedAt: null,
      lines: 2,
      output: "first\nsecond",
      usage: { inputTokens: 3 },
    };
    expect(snapshotWorker(worker, { output_bytes: 6 }, 150)).toEqual({
      id: "agent-1",
      task: "inspect",
      status: "running",
      pid: 41,
      cwd: "/work",
      elapsed_ms: 50,
      lines: 2,
      output: "second",
      usage: { inputTokens: 3 },
    });
    expect(snapshotWorker({ ...worker, finishedAt: 125, error: "spawn failed" }, {}, 900)).toEqual(
      expect.objectContaining({ elapsed_ms: 25, error: "spawn failed" }),
    );
    expect(snapshotWorker({ ...worker, output: null }, {}, 100)).toMatchObject({ output: "" });
    expect(snapshotWorker(worker)).toMatchObject({ id: "agent-1", status: "running" });
  });
});
