import {
  appendFile,
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOG_BYTES = 10 * 1024 * 1024;
const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function workerStateDirectory(
  env = process.env,
  platform = process.platform,
  home = homedir(),
) {
  if (platform === "win32")
    return join(
      env.LOCALAPPDATA || env.XDG_STATE_HOME || join(home, "AppData", "Local"),
      "AgentX",
      "State",
    );
  if (platform === "darwin")
    return join(
      env.XDG_STATE_HOME || join(home, "Library", "Application Support"),
      "AgentX",
      "State",
    );
  return join(env.XDG_STATE_HOME || join(home, ".local", "state"), "agentx");
}

function canonicalCwd(cwd) {
  const absolute = resolve(cwd);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

export function workerDirectory(cwd, platform = process.platform, root = workerStateDirectory()) {
  const canonicalPath = canonicalCwd(cwd);
  const canonical = platform === "win32" ? canonicalPath.toLowerCase() : canonicalPath;
  const key = createHash("sha256").update(canonical).digest("hex");
  return join(root, "workers", key);
}

function legacyWorkerDirectory(cwd) {
  return join(cwd, ".agentx", "workers");
}

function workerFilePath(directory, id, suffix) {
  if (!WORKER_ID_PATTERN.test(String(id))) throw new Error("Invalid worker ID");
  return join(directory, `${id}${suffix}`);
}

export function workerRecordPath(cwd, id) {
  return workerFilePath(workerDirectory(cwd), id, ".json");
}
export function workerLogPath(cwd, id) {
  return workerFilePath(workerDirectory(cwd), id, ".log");
}

async function secureDirectory(directory, platform = process.platform) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (platform !== "win32") await chmod(directory, 0o700);
}
async function ensure(cwd) {
  const root = workerStateDirectory();
  await secureDirectory(root);
  await secureDirectory(join(root, "workers"));
  await secureDirectory(workerDirectory(cwd));
}
async function atomicWrite(file, value) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
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

export async function saveWorkerRecord(cwd, record) {
  await ensure(cwd);
  await atomicWrite(workerRecordPath(cwd, record.id), record);
}
export async function readWorkerRecord(cwd, id) {
  const primary = await readOptionalFile(workerRecordPath(cwd, id));
  const legacy =
    primary === null
      ? await readOptionalFile(workerFilePath(legacyWorkerDirectory(cwd), id, ".json"))
      : null;
  const contents = primary ?? legacy;
  return contents === null ? null : JSON.parse(contents);
}
export async function appendWorkerLog(cwd, id, chunk) {
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
export async function readWorkerLog(cwd, id) {
  const [legacy, current] = await Promise.all([
    readOptionalFile(workerFilePath(legacyWorkerDirectory(cwd), id, ".log")),
    readOptionalFile(workerLogPath(cwd, id)),
  ]);
  return `${legacy || ""}${current || ""}`;
}

async function recordsIn(directory, readDirectory = readdir) {
  let names;
  try {
    names = await readDirectory(directory);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return [];
    throw error;
  }
  const records = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const id = name.slice(0, -5);
    if (!WORKER_ID_PATTERN.test(id)) continue;
    try {
      const record = JSON.parse(await readFile(join(directory, name), "utf8"));
      if (record?.id === id) records.push(record);
    } catch {
      /* ignore corrupt or mismatched records */
    }
  }
  return records;
}

export async function listWorkerRecords(cwd) {
  const legacy = await recordsIn(legacyWorkerDirectory(cwd));
  const current = await recordsIn(workerDirectory(cwd));
  const byId = new Map(legacy.map((record) => [record.id, record]));
  for (const record of current) byId.set(record.id, record);
  return [...byId.values()];
}
export async function cleanupWorkerRecords(cwd, now = Date.now()) {
  const directories = [workerDirectory(cwd), legacyWorkerDirectory(cwd)];
  for (const directory of directories) {
    for (const record of await recordsIn(directory)) {
      if (
        ["completed", "failed", "cancelled", "timed_out", "terminated"].includes(record.status) &&
        now - new Date(record.finished_at || record.updated_at || 0).getTime() >= RETENTION_MS
      ) {
        await Promise.allSettled([
          unlink(workerFilePath(directory, record.id, ".json")),
          unlink(workerFilePath(directory, record.id, ".log")),
        ]);
      }
    }
  }
}
export const workerRegistryInternals = {
  RETENTION_MS,
  MAX_LOG_BYTES,
  canonicalCwd,
  legacyWorkerDirectory,
  recordsIn,
  secureDirectory,
  workerStateDirectory,
};
