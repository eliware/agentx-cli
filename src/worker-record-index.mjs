import { readdir, readFile } from "node:fs/promises";
import {
  legacyWorkerDirectory,
  workerDirectory,
  workerFilePath,
  workerPathInternals,
} from "./worker-paths.mjs";

export async function recordsIn(directory, readDirectory = readdir) {
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
    if (!workerPathInternals.WORKER_ID_PATTERN.test(id)) continue;
    try {
      const record = JSON.parse(await readFile(workerFilePath(directory, id, ".json"), "utf8"));
      if (record?.id === id) records.push(record);
    } catch {
      /* ignore corrupt or mismatched records */
    }
  }
  return records;
}

export async function listIndexedWorkerRecords(cwd) {
  const legacy = await recordsIn(legacyWorkerDirectory(cwd));
  const current = await recordsIn(workerDirectory(cwd));
  const byId = new Map(legacy.map((record) => [record.id, record]));
  for (const record of current) byId.set(record.id, record);
  return [...byId.values()];
}
