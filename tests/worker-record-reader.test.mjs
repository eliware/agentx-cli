import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@jest/globals";
import { readStoredWorkerRecord, readOptionalWorkerFile } from "../src/worker-record-reader.mjs";
import { legacyWorkerDirectory, workerRecordPath } from "../src/worker-paths.mjs";

test("prefers current records and falls back to legacy records", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentx-record-read-"));
  const cwd = await mkdtemp(join(tmpdir(), "agentx-record-cwd-"));
  const key = process.platform === "win32" ? "LOCALAPPDATA" : "XDG_STATE_HOME";
  const old = process.env[key];
  process.env[key] = root;
  try {
    const currentPath = workerRecordPath(cwd, "worker-1");
    const legacyPath = join(legacyWorkerDirectory(cwd), "worker-1.json");
    await mkdir(dirname(currentPath), { recursive: true });
    await mkdir(dirname(legacyPath), { recursive: true });
    await writeFile(currentPath, JSON.stringify({ status: "current" }));
    await writeFile(legacyPath, JSON.stringify({ status: "legacy" }));
    await expect(readStoredWorkerRecord(cwd, "worker-1")).resolves.toEqual({ status: "current" });
    await rm(currentPath);
    await expect(readStoredWorkerRecord(cwd, "worker-1")).resolves.toEqual({ status: "legacy" });
    await expect(readStoredWorkerRecord(cwd, "missing")).resolves.toBeNull();
  } finally {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
    await rm(root, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test("preserves worker record read errors outside missing paths", async () => {
  const read = async () => {
    throw Object.assign(new Error("denied"), { code: "EACCES" });
  };
  await expect(readOptionalWorkerFile("record.json", read)).rejects.toThrow("denied");
});
