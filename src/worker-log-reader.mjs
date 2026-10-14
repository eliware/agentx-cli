import { readFile } from "node:fs/promises";
import { legacyWorkerDirectory, workerFilePath, workerLogPath } from "./worker-paths.mjs";

async function readOptionalLog(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw error;
  }
}

export async function readStoredWorkerLog(cwd, id) {
  const [legacy, current] = await Promise.all([
    readOptionalLog(workerFilePath(legacyWorkerDirectory(cwd), id, ".log")),
    readOptionalLog(workerLogPath(cwd, id)),
  ]);
  return `${legacy || ""}${current || ""}`;
}
