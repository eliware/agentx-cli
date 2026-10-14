import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@jest/globals";
import {
  appendStoredWorkerLog,
  readStoredWorkerLog,
  readStoredWorkerRecord,
  saveStoredWorkerRecord,
} from "../src/worker-record-storage.mjs";

test("stores records and appends searchable worker logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentx-storage-"));
  const key = process.platform === "win32" ? "LOCALAPPDATA" : "XDG_STATE_HOME";
  const old = process.env[key];
  process.env[key] = root;
  try {
    await saveStoredWorkerRecord(root, { id: "worker-1", status: "running" }, () => "tmp-id");
    await appendStoredWorkerLog(root, "worker-1", "hello\n");
    await expect(readStoredWorkerRecord(root, "worker-1")).resolves.toMatchObject({
      status: "running",
    });
    await expect(readStoredWorkerLog(root, "worker-1")).resolves.toBe("hello\n");
  } finally {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
    await rm(root, { recursive: true, force: true });
  }
});
