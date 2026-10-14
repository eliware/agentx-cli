import { afterEach, expect, test } from "@jest/globals";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listIndexedWorkerRecords, recordsIn } from "../src/worker-record-index.mjs";
import { workerDirectory } from "../src/worker-paths.mjs";

let temp;
afterEach(async () => {
  if (temp) await rm(temp, { recursive: true, force: true });
  temp = undefined;
});

test("returns no records for a missing worker directory", async () => {
  await expect(
    recordsIn("missing", async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }),
  ).resolves.toEqual([]);
});

test("filters corrupt records and merges current records over legacy records", async () => {
  temp = await mkdtemp(path.join(os.tmpdir(), "agentx-records-"));
  const cwd = path.join(temp, "repo");
  const legacy = path.join(cwd, ".agentx", "workers");
  const stateRoot = path.join(temp, "state");
  const stateDirectory =
    process.platform === "linux"
      ? path.join(stateRoot, "agentx")
      : path.join(stateRoot, "AgentX", "State");
  const current = workerDirectory(cwd, process.platform, stateDirectory);
  await mkdir(legacy, { recursive: true });
  await mkdir(current, { recursive: true });
  await writeFile(
    path.join(legacy, "worker-1.json"),
    JSON.stringify({ id: "worker-1", value: "old" }),
  );
  await writeFile(
    path.join(current, "worker-1.json"),
    JSON.stringify({ id: "worker-1", value: "new" }),
  );
  await writeFile(path.join(current, "worker-2.json"), JSON.stringify({ id: "mismatch" }));
  await writeFile(path.join(current, "bad.json"), "{");
  await writeFile(path.join(current, "bad!.json"), "{}");

  await expect(recordsIn(current)).resolves.toEqual([{ id: "worker-1", value: "new" }]);
  const originalStateRoot = process.env.XDG_STATE_HOME;
  const originalLocalAppData = process.env.LOCALAPPDATA;
  process.env.XDG_STATE_HOME = stateRoot;
  process.env.LOCALAPPDATA = stateRoot;
  try {
    await expect(listIndexedWorkerRecords(cwd)).resolves.toEqual([
      { id: "worker-1", value: "new" },
    ]);
  } finally {
    if (originalStateRoot === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateRoot;
    if (originalLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = originalLocalAppData;
  }
});

test("rethrows errors other than a missing directory", async () => {
  await expect(
    recordsIn("missing", async () => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    }),
  ).rejects.toThrow("denied");
});
