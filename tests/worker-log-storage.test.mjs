import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, jest, test } from "@jest/globals";
import { appendStoredWorkerLog, readStoredWorkerLog } from "../src/worker-log-storage.mjs";

test("appends and reads worker logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentx-log-"));
  const key = process.platform === "win32" ? "LOCALAPPDATA" : "XDG_STATE_HOME";
  const old = process.env[key];
  process.env[key] = root;
  try {
    await expect(readStoredWorkerLog(root, "missing")).resolves.toBe("");
    await appendStoredWorkerLog(root, "worker-1", "hello\n");
    await expect(readStoredWorkerLog(root, "worker-1")).resolves.toBe("hello\n");
  } finally {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
    await rm(root, { recursive: true, force: true });
  }
});

test("truncates oversized logs and propagates unexpected read errors", async () => {
  await jest.isolateModulesAsync(async () => {
    const appendFile = jest.fn();
    const readFile = jest.fn();
    const writeFile = jest.fn();
    const stat = jest.fn();
    await jest.unstable_mockModule("node:fs/promises", () => ({
      appendFile,
      readFile,
      stat,
      writeFile,
    }));
    await jest.unstable_mockModule("../src/worker-paths.mjs", () => ({
      legacyWorkerDirectory: () => "/legacy",
      workerFilePath: () => "/legacy.log",
      workerLogPath: () => "/current.log",
    }));
    await jest.unstable_mockModule("../src/worker-storage-directories.mjs", () => ({
      ensureWorkerStorage: jest.fn(),
    }));
    const { appendStoredWorkerLog, readStoredWorkerLog, workerLogStorageInternals } =
      await import("../src/worker-log-storage.mjs");
    const limit = workerLogStorageInternals.MAX_LOG_BYTES;
    readFile.mockResolvedValueOnce(Buffer.alloc(limit + 1, 120));
    stat.mockResolvedValue({ size: limit + 1 });
    await appendStoredWorkerLog("cwd", "worker", "x");
    expect(writeFile.mock.calls[0][1]).toHaveLength(limit);

    const notDirectory = Object.assign(new Error("not a directory"), { code: "ENOTDIR" });
    readFile.mockRejectedValueOnce(notDirectory).mockRejectedValueOnce(notDirectory);
    await expect(readStoredWorkerLog("cwd", "worker")).resolves.toBe("");
    readFile.mockRejectedValue(Object.assign(new Error("denied"), { code: "EACCES" }));
    await expect(readStoredWorkerLog("cwd", "worker")).rejects.toThrow("denied");
  });
});
