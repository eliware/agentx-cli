import { expect, jest, test } from "@jest/globals";

const appendWorkerLog = jest.fn(async () => {});
await jest.unstable_mockModule("../src/worker-registry.mjs", () => ({ appendWorkerLog }));
const { createWorkerLogStream } = await import("../src/worker-log-stream.mjs");

test("buffers output, parses usage, redacts secrets, and persists the final record", async () => {
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
  expect(worker.output).toContain("worker-secret");
  expect(worker.lines).toBe(2);
  expect(worker.usage).toMatchObject({
    turns: 1,
    inputTokens: 5,
    cachedTokens: 2,
    outputTokens: 3,
  });
  expect(appendWorkerLog).toHaveBeenCalledWith(
    "/repo",
    "agent-log",
    expect.not.stringContaining("worker-secret"),
  );
  expect(persist).toHaveBeenCalledWith(worker);
});
