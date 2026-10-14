import { expect, test, jest } from "@jest/globals";

const saveWorkerRecord = jest.fn();
await jest.unstable_mockModule("../src/worker-registry.mjs", () => ({ saveWorkerRecord }));
const { persistWorkerRecord } = await import("../src/worker-process-record.mjs");

test("persists worker lifecycle fields", async () => {
  const worker = { id: "agent-1", cwd: "/repo", status: "running", startedAt: 1 };
  await persistWorkerRecord(worker);
  expect(saveWorkerRecord).toHaveBeenCalledWith(
    "/repo",
    expect.objectContaining({ id: "agent-1", status: "running", finished_at: null }),
  );
});

test("persists a completed worker with its exit details", async () => {
  const worker = {
    id: "agent-2",
    cwd: "/repo",
    status: "failed",
    startedAt: 1,
    finishedAt: 2,
    exitCode: 0,
    signal: "SIGTERM",
  };
  await persistWorkerRecord(worker);
  expect(saveWorkerRecord).toHaveBeenCalledWith(
    "/repo",
    expect.objectContaining({ finished_at: new Date(2).toISOString(), exit_code: 0 }),
  );
});
