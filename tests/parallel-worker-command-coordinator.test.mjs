import { beforeEach, expect, jest, test } from "@jest/globals";
await jest.unstable_unmockModule("node:child_process");
await jest.unstable_unmockModule("../src/worker-registry.mjs");
const { runParallelWorkerFunction } =
  await import("../src/parallel-worker-command-coordinator.mjs");
const callWorker = (name, args) => ({
  type: "function_call",
  name,
  arguments: JSON.stringify(args),
});

beforeEach(() => {
  delete process.env.AGENTX_WORKER_ID;
});
test("rejects malformed spawn requests", async () => {
  await expect(
    runParallelWorkerFunction(
      { type: "function_call", name: "spawn_agent", arguments: "{}" },
      process.cwd(),
    ),
  ).resolves.toEqual({ error: "task must be a non-empty string" });
});

test("rejects invalid calls before recovery", async () => {
  await expect(runParallelWorkerFunction(null, process.cwd())).resolves.toEqual({
    error: "invalid worker function call",
  });
  await expect(
    runParallelWorkerFunction({ type: "function_call", name: "agent_status" }, ""),
  ).resolves.toEqual({ error: "invalid working directory" });
});

test("rejects nested worker spawning", async () => {
  const previous = process.env.AGENTX_WORKER_ID;
  process.env.AGENTX_WORKER_ID = "parent";
  await expect(
    runParallelWorkerFunction(callWorker("spawn_agent", { tasks: ["task"] }), process.cwd()),
  ).resolves.toEqual({ error: "nested worker spawning is disabled" });
  if (previous === undefined) delete process.env.AGENTX_WORKER_ID;
  else process.env.AGENTX_WORKER_ID = previous;
});

test("cancels unknown agents without throwing", async () => {
  await expect(
    runParallelWorkerFunction(
      callWorker("cancel_agent", { agent_ids: ["missing-agent"] }),
      process.cwd(),
    ),
  ).resolves.toEqual({ agents: [{ id: "missing-agent", status: "unknown" }] });
});

test("routes status requests to the worker status handler", async () => {
  await expect(
    runParallelWorkerFunction(
      {
        type: "function_call",
        name: "agent_status",
        arguments: { agent_ids: ["missing-agent"] },
      },
      process.cwd(),
    ),
  ).resolves.toMatchObject({ agents: [{ id: "missing-agent", status: "unknown" }] });
});

test("returns an error for unsupported worker functions", async () => {
  await expect(
    runParallelWorkerFunction({ name: "other_tool", arguments: "{" }, process.cwd()),
  ).resolves.toEqual({ error: "unsupported worker function other_tool" });
});

test("routes malformed arguments to supported worker handlers", async () => {
  await expect(
    runParallelWorkerFunction({ name: "agent_status" }, process.cwd()),
  ).resolves.toMatchObject({ agents: [], waited_ms: 0, timed_out: false });
  await expect(
    runParallelWorkerFunction(
      { name: "cancel_agent", arguments: JSON.stringify({ agent_ids: "not-an-array" }) },
      process.cwd(),
    ),
  ).resolves.toEqual({ agents: [] });
  await expect(
    runParallelWorkerFunction(
      { name: "agent_status", arguments: JSON.stringify({ agent_ids: [], wait_ms: "nope" }) },
      process.cwd(),
    ),
  ).resolves.toMatchObject({ waited_ms: 0, timed_out: false });
});

test("does not re-announce usage for recovered workers", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { saveWorkerRecord, appendWorkerLog } = await import("../src/worker-registry.mjs");
  const cwd = await mkdtemp(join(tmpdir(), "agentx-worker-recovery-"));
  try {
    const id = "agent-old";
    await saveWorkerRecord(cwd, {
      id,
      task: "old",
      cwd,
      status: "completed",
      started_at: new Date(0).toISOString(),
      finished_at: new Date().toISOString(),
      lines: 1,
      usage: { turns: 1, inputTokens: 1, cachedTokens: 0, outputTokens: 1 },
    });
    await appendWorkerLog(cwd, id, "done\n");
    const onComplete = jest.fn();
    const onUsage = jest.fn();
    await runParallelWorkerFunction(
      { name: "agent_status", arguments: JSON.stringify({ agent_ids: [id] }) },
      cwd,
      { onComplete, onUsage },
    );
    expect(onComplete).not.toHaveBeenCalled();
    expect(onUsage).not.toHaveBeenCalled();
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("finds and cancels a recovered legacy worker", async () => {
  const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const cwd = await mkdtemp(join(tmpdir(), "agentx-legacy-worker-"));
  const id = `agent-${Date.now()}`;
  const legacyDirectory = join(cwd, ".agentx", "workers");
  const kill = jest.spyOn(process, "kill").mockImplementation(() => true);
  try {
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(
      join(legacyDirectory, `${id}.json`),
      JSON.stringify({
        id,
        task: "legacy task",
        cwd,
        pid: 54321,
        status: "running",
        started_at: new Date().toISOString(),
        lines: 1,
      }),
    );
    const status = await runParallelWorkerFunction(
      { name: "agent_status", arguments: JSON.stringify({ agent_ids: [id] }) },
      cwd,
    );
    expect(status.agents[0]).toMatchObject({ id, status: "running" });

    const cancelled = await runParallelWorkerFunction(
      { name: "cancel_agent", arguments: JSON.stringify({ agent_ids: [id] }) },
      cwd,
    );
    expect(cancelled.agents[0]).toMatchObject({ id, status: "cancelled" });
  } finally {
    kill.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  }
});
