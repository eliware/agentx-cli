import {
  appendFile,
  chmod,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  legacyWorkerDirectory,
  workerFilePath,
  workerLogPath,
  workerRecordPath,
  workerDirectory,
  workerStateDirectory,
} from "./worker-paths.mjs";

const MAX_LOG_BYTES = 10 * 1024 * 1024;

async function secureDirectory(directory, platform = process.platform) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (platform !== "win32") await chmod(directory, 0o700);
}

async function ensure(cwd) {
  const root = workerStateDirectory();
  await secureDirectory(root);
  await secureDirectory(`${root}/workers`);
  await secureDirectory(workerDirectory(cwd));
}

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

async function readOptionalFile(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw error;
  }
}

export async function saveStoredWorkerRecord(cwd, record, makeId) {
  await ensure(cwd);
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

export async function appendStoredWorkerLog(cwd, id, chunk) {
  await ensure(cwd);
  const file = workerLogPath(cwd, id);
  await appendFile(file, chunk, { mode: 0o600 });
  try {
    const info = await stat(file);
    if (info.size > MAX_LOG_BYTES) {
      const data = await readFile(file);
      await writeFile(file, data.subarray(data.length - MAX_LOG_BYTES), { mode: 0o600 });
    }
  } catch {
    /* best effort logging */
  }
}

export async function readStoredWorkerLog(cwd, id) {
  const [legacy, current] = await Promise.all([
    readOptionalFile(workerFilePath(legacyWorkerDirectory(cwd), id, ".log")),
    readOptionalFile(workerLogPath(cwd, id)),
  ]);
  return `${legacy || ""}${current || ""}`;
}

export const workerStorageInternals = { MAX_LOG_BYTES, atomicWrite, secureDirectory };
