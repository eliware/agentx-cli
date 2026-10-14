import { expect, jest, test } from "@jest/globals";

async function loadReader(readFile) {
  await jest.unstable_mockModule("node:fs/promises", () => ({ readFile }));
  await jest.unstable_mockModule("../src/worker-paths.mjs", () => ({
    legacyWorkerDirectory: () => "/legacy",
    workerFilePath: () => "/legacy/worker.log",
    workerLogPath: () => "/current/worker.log",
  }));
  return import("../src/worker-log-reader.mjs");
}

test("joins current and legacy worker logs", async () => {
  await jest.isolateModulesAsync(async () => {
    const readFile = jest.fn().mockResolvedValueOnce("legacy\n").mockResolvedValueOnce("current\n");
    const { readStoredWorkerLog } = await loadReader(readFile);
    await expect(readStoredWorkerLog("cwd", "worker")).resolves.toBe("legacy\ncurrent\n");
    expect(readFile).toHaveBeenCalledWith("/legacy/worker.log", "utf8");
    expect(readFile).toHaveBeenCalledWith("/current/worker.log", "utf8");
  });
});

test.each(["ENOENT", "ENOTDIR"])("treats %s as an absent log", async (code) => {
  await jest.isolateModulesAsync(async () => {
    const error = Object.assign(new Error("missing"), { code });
    const readFile = jest.fn().mockRejectedValue(error);
    const { readStoredWorkerLog } = await loadReader(readFile);
    await expect(readStoredWorkerLog("cwd", "worker")).resolves.toBe("");
  });
});

test("propagates unexpected log read errors", async () => {
  await jest.isolateModulesAsync(async () => {
    const readFile = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error("denied"), { code: "EACCES" }));
    const { readStoredWorkerLog } = await loadReader(readFile);
    await expect(readStoredWorkerLog("cwd", "worker")).rejects.toThrow("denied");
  });
});
