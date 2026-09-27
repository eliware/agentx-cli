import { expect, jest, test } from "@jest/globals";

const readWorkerRecord = jest.fn(async (_cwd, id) => ({ id, status: "running" }));
jest.unstable_mockModule("../src/worker-registry.mjs", () => ({
  appendWorkerLog: jest.fn(),
  cleanupWorkerRecords: jest.fn(),
  listWorkerRecords: jest.fn(async () => []),
  readWorkerLog: jest.fn(async () => ""),
  readWorkerRecord,
  saveWorkerRecord: jest.fn(),
}));

const { runParallelWorkerFunction } = await import("../src/parallel-workers.mjs");

test("returns a concurrently persisted worker from cancel lookup", async () => {
  const result = await runParallelWorkerFunction(
    { name: "cancel_agent", arguments: JSON.stringify({ agent_ids: ["agent-racing"] }) },
    process.cwd(),
  );

  expect(readWorkerRecord).toHaveBeenCalledWith(process.cwd(), "agent-racing");
  expect(result).toEqual({ agents: [{ id: "agent-racing", status: "running" }] });
});
