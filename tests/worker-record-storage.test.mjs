import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@jest/globals";
import {
  readStoredWorkerRecord,
  saveStoredWorkerRecord,
  workerRecordStorageInternals,
} from "../src/worker-record-storage.mjs";

test("stores and reads worker records", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentx-storage-"));
  const key = process.platform === "win32" ? "LOCALAPPDATA" : "XDG_STATE_HOME";
  const old = process.env[key];
  process.env[key] = root;
  try {
    await saveStoredWorkerRecord(root, { id: "worker-1", status: "running" }, () => "tmp-id");
    await expect(readStoredWorkerRecord(root, "worker-1")).resolves.toMatchObject({
      status: "running",
    });
  } finally {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
    await rm(root, { recursive: true, force: true });
  }
});

test("reports worker record read errors outside missing paths", async () => {
  const read = async () => {
    throw Object.assign(new Error("denied"), { code: "EACCES" });
  };
  await expect(workerRecordStorageInternals.readOptionalFile("record.json", read)).rejects.toThrow(
    "denied",
  );
});
