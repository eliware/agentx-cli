import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@jest/globals";
import { appendStoredWorkerLog, readStoredWorkerLog } from "../src/worker-log-storage.mjs";

test("appends and reads worker logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentx-log-"));
  const key = process.platform === "win32" ? "LOCALAPPDATA" : "XDG_STATE_HOME";
  const old = process.env[key];
  process.env[key] = root;
  try {
    await appendStoredWorkerLog(root, "worker-1", "hello\n");
    await expect(readStoredWorkerLog(root, "worker-1")).resolves.toBe("hello\n");
  } finally {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
    await rm(root, { recursive: true, force: true });
  }
});
