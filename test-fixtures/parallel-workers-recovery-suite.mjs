import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

const spawnMock = jest.fn();
jest.unstable_mockModule("node:child_process", () => ({ spawn: spawnMock }));

const { runParallelWorkerFunction } = await import("../src/parallel-workers.mjs");
const { readWorkerRecord, saveWorkerRecord } = await import("../src/worker-registry.mjs");

let cwd;
let stateRoot;
let previousStateRoot;
let stateEnvKey;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agentx-worker-recovery-cwd-"));
  stateRoot = await mkdtemp(join(tmpdir(), "agentx-worker-recovery-state-"));
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

test("marks a legacy worker failed when cancellation finds no process", async () => {
  const id = `agent-missing-${Date.now()}`;
  const legacyDirectory = join(cwd, ".agentx", "workers");
  const kill = jest.spyOn(process, "kill").mockImplementation((_pid, signal) => {
    if (signal === 0) return true;
    throw Object.assign(new Error("no process"), { code: "ESRCH" });
  });
  try {
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(
      join(legacyDirectory, `${id}.json`),
      JSON.stringify({
        id,
        task: "orphan task",
        cwd,
        pid: 54322,
        status: "running",
        started_at: new Date().toISOString(),
      }),
    );
    const status = await runParallelWorkerFunction(
      { name: "cancel_agent", arguments: JSON.stringify({ agent_ids: [id] }) },
      cwd,
    );
    expect(kill).toHaveBeenCalledWith(54322, 0);
    expect(kill).toHaveBeenCalledWith(54322, "SIGTERM");
    expect(status.agents[0]).toMatchObject({
      status: "failed",
      error: "worker process no longer exists",
    });
  } finally {
    kill.mockRestore();
  }
});

test("marks recovered records failed when the process no longer exists", async () => {
  const id = `agent-recovery-missing-${Date.now()}`;
  const legacyDirectory = join(cwd, ".agentx", "workers");
  const kill = jest.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("no process"), { code: "ESRCH" });
  });
  try {
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(
      join(legacyDirectory, `${id}.json`),
      JSON.stringify({
        id,
        task: "orphan task",
        cwd,
        pid: 54323,
        status: "running",
        started_at: "not-a-date",
      }),
    );
    const result = await runParallelWorkerFunction(
      { name: "agent_status", arguments: JSON.stringify({ agent_ids: [id] }) },
      cwd,
    );
    expect(result.agents[0]).toMatchObject({
      id,
      status: "failed",
      error: "worker process no longer exists",
    });
    expect(await readWorkerRecord(cwd, id)).toMatchObject({ id, status: "failed" });
  } finally {
    kill.mockRestore();
  }
});

test("preserves a recovered worker when the process refuses termination", async () => {
  const id = `agent-termination-denied-${Date.now()}`;
  const legacyDirectory = join(cwd, ".agentx", "workers");
  const kill = jest.spyOn(process, "kill").mockImplementation((_pid, signal) => {
    if (signal === 0) return true;
    throw Object.assign(new Error("permission denied"), { code: "EPERM" });
  });
  try {
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(
      join(legacyDirectory, `${id}.json`),
      JSON.stringify({
        id,
        cwd,
        pid: 54324,
        status: "running",
        started_at: new Date().toISOString(),
      }),
    );
    const result = await runParallelWorkerFunction(
      { name: "cancel_agent", arguments: JSON.stringify({ agent_ids: [id] }) },
      cwd,
    );
    expect(result.agents[0]).toMatchObject({ id, status: "running" });
    expect(kill).toHaveBeenCalledWith(54324, "SIGTERM");
  } finally {
    kill.mockRestore();
  }
});

test("recovers completed records without a stored cwd", async () => {
  const id = `agent-no-cwd-${Date.now()}`;
  await saveWorkerRecord(cwd, {
    id,
    task: "completed task",
    status: "completed",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
  const result = await runParallelWorkerFunction(
    { name: "agent_status", arguments: JSON.stringify({ agent_ids: [id] }) },
    cwd,
  );
  expect(result.agents[0]).toMatchObject({ id, status: "completed", cwd });
});
