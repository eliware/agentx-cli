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
