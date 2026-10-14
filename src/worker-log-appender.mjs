import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import { workerLogPath } from "./worker-paths.mjs";
import { ensureWorkerStorage } from "./worker-storage-directories.mjs";

export const MAX_LOG_BYTES = 10 * 1024 * 1024;

export async function appendStoredWorkerLog(cwd, id, chunk) {
  await ensureWorkerStorage(cwd);
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
