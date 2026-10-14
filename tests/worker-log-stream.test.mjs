import { afterEach, expect, jest, test } from "@jest/globals";

const appendWorkerLog = jest.fn(async () => {});
await jest.unstable_mockModule("../src/worker-registry.mjs", () => ({ appendWorkerLog }));
const { createWorkerLogStream } = await import("../src/worker-log-stream.mjs");

afterEach(() => {
  jest.useRealTimers();
  appendWorkerLog.mockReset();
  appendWorkerLog.mockResolvedValue(undefined);
});

test("buffers output, redacts secrets, and persists the final record", async () => {
  const previousKey = process.env.AGENTX_API_KEY;
  process.env.AGENTX_API_KEY = "worker-secret";
  appendWorkerLog.mockClear();
  const worker = { id: "agent-log", cwd: "/repo", output: "", lines: 0, usage: null };
  const persist = jest.fn(async () => {});
  const stream = createWorkerLogStream(worker, persist);
  stream.append(`worker-secret\n${JSON.stringify({ in: "5", cache: "2", out: "3" })}\n`);
  await stream.close();
  if (previousKey === undefined) delete process.env.AGENTX_API_KEY;
  else process.env.AGENTX_API_KEY = previousKey;
  expect(appendWorkerLog).toHaveBeenCalledWith(
    "/repo",
    "agent-log",
    expect.not.stringContaining("worker-secret"),
  );
  expect(persist).toHaveBeenCalledWith(worker);
});

test("flushes a timed buffer and ignores storage failures", async () => {
  jest.useFakeTimers();
  const worker = { id: "agent-empty", cwd: "/repo", output: "", lines: 0, usage: null };
  const persist = jest.fn(async () => {});
  const stream = createWorkerLogStream(worker, persist);
  stream.append("plain output\n");
  stream.append("");
  await jest.advanceTimersByTimeAsync(50);
  expect(appendWorkerLog).toHaveBeenCalledWith("/repo", "agent-empty", "plain output\n");
  await stream.close();
  appendWorkerLog.mockRejectedValueOnce(new Error("disk unavailable"));
  stream.append("next output\n");
  await expect(stream.close()).resolves.toBeUndefined();
  expect(persist).toHaveBeenCalled();
});
