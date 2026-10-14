import { snowflake } from "@eliware/common";
import { readStoredWorkerRecord, saveStoredWorkerRecord } from "./worker-record-storage.mjs";
import { appendStoredWorkerLog } from "./worker-log-appender.mjs";
import { readStoredWorkerLog } from "./worker-log-reader.mjs";
import { listIndexedWorkerRecords, recordsIn } from "./worker-record-index.mjs";
import { pruneWorkerRecords, workerRecordRetentionInternals } from "./worker-record-retention.mjs";
import { workerStorageDirectoryInternals } from "./worker-storage-directories.mjs";
import {
  workerDirectory,
  workerLogPath,
  workerRecordPath,
  workerPathInternals,
  legacyWorkerDirectory,
} from "./worker-paths.mjs";
import { workerStateDirectory } from "./worker-state-root.mjs";

export const workerRegistryInternals = {
  ...workerStorageDirectoryInternals,
  ...workerPathInternals,
  ...workerRecordRetentionInternals,
  legacyWorkerDirectory,
  workerStateDirectory,
  recordsIn,
};

export { workerDirectory, workerLogPath, workerRecordPath, workerStateDirectory };

export function saveWorkerRecord(cwd, record) {
  return saveStoredWorkerRecord(cwd, record, snowflake);
}

export const readWorkerRecord = readStoredWorkerRecord;
export const appendWorkerLog = appendStoredWorkerLog;
export const readWorkerLog = readStoredWorkerLog;
export const listWorkerRecords = listIndexedWorkerRecords;
export const cleanupWorkerRecords = pruneWorkerRecords;
