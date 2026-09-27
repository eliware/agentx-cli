import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

const spawnMock = jest.fn();
jest.unstable_mockModule("node:child_process", () => ({ spawn: spawnMock }));

const { runParallelWorkerFunction } = await import("../src/parallel-workers.mjs");
const { readWorkerRecord } = await import("../src/worker-registry.mjs");

function createChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 76543;
  child.kill = jest.fn();
  child.unref = jest.fn();
  return child;
}

let cwd;
let stateRoot;
let previousStateRoot;
let stateEnvKey;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agentx-worker-spawn-cwd-"));
  stateRoot = await mkdtemp(join(tmpdir(), "agentx-worker-spawn-state-"));
  stateEnvKey = process.platform === "win32" ? "LOCALAPPDATA" : "XDG_STATE_HOME";
  previousStateRoot = process.env[stateEnvKey];
  process.env[stateEnvKey] = stateRoot;
  spawnMock.mockReset();
});

afterEach(async () => {
  if (previousStateRoot === undefined) delete process.env[stateEnvKey];
  else process.env[stateEnvKey] = previousStateRoot;
  await rm(cwd, { recursive: true, force: true });
  await rm(stateRoot, { recursive: true, force: true });
});

test("spawns, persists, and reports worker status", async () => {
  const configPath = join(cwd, ".agentx");
  await writeFile(configPath, "user config remains intact\n");
  const child = createChild();
  spawnMock.mockReturnValue(child);
  let complete;
  const completed = new Promise((resolve) => {
    complete = resolve;
  });

  const spawned = await runParallelWorkerFunction(
    {
      name: "spawn_agent",
      arguments: JSON.stringify({ task: "independent task", permissions: "read" }),
    },
    cwd,
    { debug: true, onWorkerComplete: complete },
  );

  const id = spawned.agent.id;
  expect(spawned.agent.status).toBe("running");
  expect(spawned.timed_out).toBe(false);
  expect(spawnMock).toHaveBeenCalledWith(
    process.execPath,
    expect.arrayContaining(["--debug", "--", "independent task"]),
    expect.objectContaining({
      cwd,
      env: expect.objectContaining({ AGENTX_PERMISSION: "read", AGENTX_WORKER_ID: id }),
    }),
  );

  child.stdout.emit("data", Buffer.from("worker "));
  child.stderr.emit("data", Buffer.from("output\n"));
  const waitingStatusPromise = runParallelWorkerFunction(
    {
      name: "agent_status",
      arguments: JSON.stringify({ agent_ids: [id, "missing-during-wait"], wait_ms: 1000 }),
    },
    cwd,
  );
  setTimeout(() => child.emit("close", 0, null), 10);
  const waitingStatus = await waitingStatusPromise;
  expect(waitingStatus.timed_out).toBe(false);
  expect(waitingStatus.agents[1]).toEqual({ id: "missing-during-wait", status: "unknown" });
  await completed;

  const status = await runParallelWorkerFunction(
    { name: "agent_status", arguments: JSON.stringify({ agent_ids: [id] }) },
    cwd,
  );
  expect(status.agents[0]).toMatchObject({ id, status: "completed", output: "worker output\n" });

  let record = null;
  for (let attempt = 0; attempt < 30 && record?.status !== "completed"; attempt += 1) {
    record = await readWorkerRecord(cwd, id);
    if (record?.status !== "completed") await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(record).toMatchObject({ id, status: "completed", permissions: "read" });
  expect(await readFile(configPath, "utf8")).toBe("user config remains intact\n");
});

test("flushes buffered output and finalizes a worker spawn error", async () => {
  jest.useFakeTimers();
  const child = createChild();
  spawnMock.mockReturnValue(child);
  let complete;
  const completed = new Promise((resolve) => {
    complete = resolve;
  });
  const onComplete = jest.fn(complete);
  try {
    const spawned = await runParallelWorkerFunction(
      { name: "spawn_agent", arguments: JSON.stringify({ task: "buffer test" }) },
      cwd,
      { onWorkerComplete: onComplete },
    );
    child.stdout.emit("data", "buffered output\n");
    await jest.advanceTimersByTimeAsync(50);
    child.emit("error", new Error("spawn failed"));
    const worker = await completed;
    expect(worker).toMatchObject({ status: "failed", error: "spawn failed" });
    child.emit("close", null, null);
    expect(onComplete).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
    let record;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      record = await readWorkerRecord(cwd, spawned.agent.id);
      if (record?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(record).toMatchObject({ status: "failed" });
  } finally {
    jest.useRealTimers();
  }
});

test("escalates worker timeout and finalizes timed-out status", async () => {
  jest.useFakeTimers();
  const child = createChild();
  spawnMock.mockReturnValue(child);
  let complete;
  const completed = new Promise((resolve) => {
    complete = resolve;
  });
  try {
    await runParallelWorkerFunction(
      { name: "spawn_agent", arguments: JSON.stringify({ task: "timeout test" }) },
      cwd,
      { onWorkerComplete: complete },
    );
    await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    await jest.advanceTimersByTimeAsync(2000);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
    expect(await completed).toMatchObject({ status: "timed_out" });
  } finally {
    jest.useRealTimers();
  }
});

test("does not escalate a timed-out worker after it closes", async () => {
  jest.useFakeTimers();
  const child = createChild();
  spawnMock.mockReturnValue(child);
  let complete;
  const completed = new Promise((resolve) => {
    complete = resolve;
  });
  try {
    await runParallelWorkerFunction(
      { name: "spawn_agent", arguments: JSON.stringify({ task: "close timeout test" }) },
      cwd,
      { onWorkerComplete: complete },
    );
    await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
    child.emit("close", 1, "SIGTERM");
    expect(await completed).toMatchObject({ status: "timed_out" });
    await jest.advanceTimersByTimeAsync(2000);
    expect(child.kill).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test("cancels an active spawned worker", async () => {
  const child = createChild();
  spawnMock.mockReturnValue(child);
  let complete;
  const completed = new Promise((resolve) => {
    complete = resolve;
  });
  const spawned = await runParallelWorkerFunction(
    {
      name: "spawn_agent",
      arguments: JSON.stringify({ task: "cancel test", wait_ms: 1 }),
    },
    cwd,
    { onWorkerComplete: complete },
  );
  const id = spawned.agent.id;
  const cancelled = await runParallelWorkerFunction(
    { name: "cancel_agent", arguments: JSON.stringify({ agent_ids: [id] }) },
    cwd,
  );
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  expect(cancelled.agents[0]).toMatchObject({ id, status: "cancelled" });
  await runParallelWorkerFunction(
    { name: "cancel_agent", arguments: JSON.stringify({ agent_ids: [id] }) },
    cwd,
  );
  expect(child.kill).toHaveBeenCalledTimes(1);
  child.emit("close", null, "SIGTERM");
  expect(await completed).toMatchObject({ status: "cancelled" });
});

test("terminates active workers during parent shutdown", async () => {
  const child = createChild();
  child.killed = false;
  child.kill.mockImplementation((signal) => {
    if (signal === "SIGTERM") throw new Error("best-effort termination");
  });
  spawnMock.mockReturnValue(child);
  try {
    const spawned = await runParallelWorkerFunction(
      { name: "spawn_agent", arguments: JSON.stringify({ task: "shutdown test" }) },
      cwd,
    );
    const { terminateWorkers } = await import("../src/parallel-workers.mjs");
    await terminateWorkers();
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    expect(spawned.agent.id).toBeTruthy();
  } finally {
    child.emit("close", null, "SIGKILL");
  }
});

test("handles failed state persistence through log flush and shutdown", async () => {
  jest.useFakeTimers();
  const { writeFile } = await import("node:fs/promises");
  await rm(stateRoot, { recursive: true, force: true });
  await writeFile(stateRoot, "blocks worker state directory creation");
  const child = createChild();
  spawnMock.mockReturnValue(child);
  let sawTerm;
  const termSent = new Promise((resolve) => {
    sawTerm = resolve;
  });
  child.kill.mockImplementation((signal) => {
    if (signal === "SIGTERM") sawTerm();
  });
  try {
    const spawned = await runParallelWorkerFunction(
      { name: "spawn_agent", arguments: JSON.stringify({ task: "unwritable state test" }) },
      cwd,
    );
    child.stdout.emit("data", "cannot persist this output");
    await jest.advanceTimersByTimeAsync(50);
    const { terminateWorkers } = await import("../src/parallel-workers.mjs");
    const termination = terminateWorkers();
    await termSent;
    await jest.advanceTimersByTimeAsync(2000);
    await termination;
    await jest.advanceTimersByTimeAsync(10 * 60 * 1000 - 2050);
    await jest.advanceTimersByTimeAsync(2000);
    const lateTermination = terminateWorkers();
    await jest.advanceTimersByTimeAsync(2000);
    await lateTermination;
    child.emit("close", null, "SIGKILL");
    expect(spawned.agent.status).toBe("running");
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  } finally {
    jest.useRealTimers();
  }
});

test("does not force-kill a worker already marked killed", async () => {
  const child = createChild();
  child.killed = true;
  spawnMock.mockReturnValue(child);
  const spawned = await runParallelWorkerFunction(
    { name: "spawn_agent", arguments: JSON.stringify({ task: "already killed test" }) },
    cwd,
  );
  const { terminateWorkers } = await import("../src/parallel-workers.mjs");
  await terminateWorkers();
  expect(child.kill).toHaveBeenCalledTimes(1);
  child.emit("close", null, "SIGTERM");
  expect(spawned.agent.id).toBeTruthy();
});
