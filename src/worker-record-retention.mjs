import { unlink } from "node:fs/promises";
import { legacyWorkerDirectory, workerDirectory, workerFilePath } from "./worker-paths.mjs";
import { recordsIn } from "./worker-record-index.mjs";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = ["completed", "failed", "cancelled", "timed_out", "terminated"];

export async function pruneWorkerRecords(cwd, now = Date.now()) {
  for (const directory of [workerDirectory(cwd), legacyWorkerDirectory(cwd)]) {
    for (const record of await recordsIn(directory)) {
      const finished = new Date(record.finished_at || record.updated_at || 0).getTime();
      if (TERMINAL_STATUSES.includes(record.status) && now - finished >= RETENTION_MS) {
        await Promise.allSettled([
          unlink(workerFilePath(directory, record.id, ".json")),
          unlink(workerFilePath(directory, record.id, ".log")),
        ]);
      }
    }
  }
}

export const workerRecordRetentionInternals = { RETENTION_MS, TERMINAL_STATUSES };
