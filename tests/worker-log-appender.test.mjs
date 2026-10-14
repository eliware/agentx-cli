import { expect, jest, test } from "@jest/globals";
import { MAX_LOG_BYTES } from "../src/worker-log-appender.mjs";

async function loadAppender({ appendFile, readFile, stat, writeFile }) {
  await jest.unstable_mockModule("node:fs/promises", () => ({
    appendFile,
    readFile,
    stat,
    writeFile,
  }));
  await jest.unstable_mockModule("../src/worker-paths.mjs", () => ({
    workerLogPath: () => "/current.log",
  }));
  await jest.unstable_mockModule("../src/worker-storage-directories.mjs", () => ({
    ensureWorkerStorage: jest.fn(),
  }));
  return import("../src/worker-log-appender.mjs");
}

test("appends without truncation when the log fits its limit", async () => {
  await jest.isolateModulesAsync(async () => {
    const appendFile = jest.fn();
    const readFile = jest.fn();
    const stat = jest.fn().mockResolvedValue({ size: 10 });
    const writeFile = jest.fn();
    const { appendStoredWorkerLog } = await loadAppender({ appendFile, readFile, stat, writeFile });
    await appendStoredWorkerLog("cwd", "worker", "line");
    expect(appendFile).toHaveBeenCalledWith("/current.log", "line", { mode: 0o600 });
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});

test("truncates oversized logs to the configured byte limit", async () => {
  await jest.isolateModulesAsync(async () => {
    const appendFile = jest.fn();
    const readFile = jest.fn().mockResolvedValue(Buffer.alloc(MAX_LOG_BYTES + 1, 120));
    const stat = jest.fn().mockResolvedValue({ size: MAX_LOG_BYTES + 1 });
    const writeFile = jest.fn();
    const { appendStoredWorkerLog } = await loadAppender({ appendFile, readFile, stat, writeFile });
    await appendStoredWorkerLog("cwd", "worker", "line");
    expect(writeFile.mock.calls[0][1]).toHaveLength(MAX_LOG_BYTES);
  });
});

test("continues when best-effort size checks fail", async () => {
  await jest.isolateModulesAsync(async () => {
    const appendFile = jest.fn();
    const readFile = jest.fn();
    const stat = jest.fn().mockRejectedValue(new Error("stat failed"));
    const writeFile = jest.fn();
    const { appendStoredWorkerLog } = await loadAppender({ appendFile, readFile, stat, writeFile });
    await expect(appendStoredWorkerLog("cwd", "worker", "line")).resolves.toBeUndefined();
  });
});
