import { ensureWorkerStorage } from "./worker-storage-directories.mjs";
import { readStoredWorkerRecord as readRecord } from "./worker-record-reader.mjs";
import { writeWorkerRecordFile } from "./worker-record-writer.mjs";
import { workerRecordPath } from "./worker-paths.mjs";

export async function saveStoredWorkerRecord(cwd, record, makeId) {
  await ensureWorkerStorage(cwd);
  await writeWorkerRecordFile(workerRecordPath(cwd, record.id), record, makeId);
}

export function readStoredWorkerRecord(cwd, id) {
  return readRecord(cwd, id);
}
