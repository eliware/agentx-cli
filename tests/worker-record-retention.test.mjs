import { afterEach, beforeEach, expect, test } from "@jest/globals";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  pruneWorkerRecords,
  workerRecordRetentionInternals,
} from "../src/worker-record-retention.mjs";
import { workerDirectory } from "../src/worker-paths.mjs";

let cwd;
let root;
let envKey;
let oldRoot;

beforeEach(async () => {
  cwd = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), "agentx-retention-cwd-")),
  );
  root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), "agentx-retention-state-")),
  );
  envKey = process.platform === "win32" ? "LOCALAPPDATA" : "XDG_STATE_HOME";
  oldRoot = process.env[envKey];
  process.env[envKey] = root;
});

afterEach(async () => {
  if (oldRoot === undefined) delete process.env[envKey];
  else process.env[envKey] = oldRoot;
  await rm(cwd, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
});

test("deletes expired terminal records and logs but keeps active or recent records", async () => {
  const directory = workerDirectory(cwd);
  await mkdir(directory, { recursive: true });
  const now = Date.now();
  const old = new Date(now - workerRecordRetentionInternals.RETENTION_MS).toISOString();
  const recent = new Date(now).toISOString();
  for (const [id, status, finished] of [
    ["expired", "completed", old],
    ["active", "running", old],
    ["recent", "failed", recent],
  ]) {
    await writeFile(
      join(directory, `${id}.json`),
      JSON.stringify({ id, status, finished_at: finished }),
    );
    await writeFile(join(directory, `${id}.log`), "worker output");
  }

  await pruneWorkerRecords(cwd, now);

  await expect(readFile(join(directory, "expired.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(directory, "expired.log"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(directory, "active.json"))).resolves.toBeTruthy();
  await expect(readFile(join(directory, "recent.json"))).resolves.toBeTruthy();
});
