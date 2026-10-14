import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { legacyWorkerDirectory, workerFilePath, workerRecordPath } from "./worker-paths.mjs";
import { ensureWorkerStorage } from "./worker-storage-directories.mjs";

async function atomicWrite(file, value, makeId) {
  const temp = `${file}.${process.pid}.${makeId()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temp, file);
  } catch (error) {
    try {
      await unlink(temp);
    } catch {
      /* cleanup is best effort */
    }
    throw error;
  }
}

async function readOptionalFile(file, read = readFile) {
  try {
    return await read(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw error;
  }
}

export async function saveStoredWorkerRecord(cwd, record, makeId) {
  await ensureWorkerStorage(cwd);
  await atomicWrite(workerRecordPath(cwd, record.id), record, makeId);
}

export async function readStoredWorkerRecord(cwd, id) {
  const primary = await readOptionalFile(workerRecordPath(cwd, id));
  const legacy =
    primary === null
      ? await readOptionalFile(workerFilePath(legacyWorkerDirectory(cwd), id, ".json"))
      : null;
  const contents = primary ?? legacy;
  return contents === null ? null : JSON.parse(contents);
}

export const workerRecordStorageInternals = { atomicWrite, readOptionalFile };
