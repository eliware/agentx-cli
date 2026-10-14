import { readFile } from "node:fs/promises";
import { legacyWorkerDirectory, workerFilePath, workerRecordPath } from "./worker-paths.mjs";

export async function readOptionalWorkerFile(file, read = readFile) {
  try {
    return await read(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw error;
  }
}

export async function readStoredWorkerRecord(cwd, id) {
  const primary = await readOptionalWorkerFile(workerRecordPath(cwd, id));
  const legacy =
    primary === null
      ? await readOptionalWorkerFile(workerFilePath(legacyWorkerDirectory(cwd), id, ".json"))
      : null;
  const contents = primary ?? legacy;
  return contents === null ? null : JSON.parse(contents);
}
