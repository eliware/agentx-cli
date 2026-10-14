import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@jest/globals";
import { ensureWorkerStorage } from "../src/worker-storage-directories.mjs";
import { workerDirectory, workerStateDirectory } from "../src/worker-paths.mjs";

test("creates private worker storage directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentx-dirs-"));
  const key = process.platform === "win32" ? "LOCALAPPDATA" : "XDG_STATE_HOME";
  const old = process.env[key];
  process.env[key] = root;
  try {
    await ensureWorkerStorage(root);
    const directories = [
      workerStateDirectory(),
      join(workerStateDirectory(), "workers"),
      workerDirectory(root),
    ];
    for (const directory of directories) {
      const info = await stat(directory);
      expect(info.isDirectory()).toBe(true);
      if (process.platform !== "win32") expect(info.mode & 0o777).toBe(0o700);
    }
  } finally {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
    await rm(root, { recursive: true, force: true });
  }
});
