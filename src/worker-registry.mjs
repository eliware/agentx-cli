import { snowflake } from "@eliware/common";
import {
  appendStoredWorkerLog,
  readStoredWorkerLog,
  readStoredWorkerRecord,
  saveStoredWorkerRecord,
  workerStorageInternals,
} from "./worker-record-storage.mjs";
import {
  listIndexedWorkerRecords,
  pruneWorkerRecords,
  recordsIn,
  workerIndexInternals,
} from "./worker-record-index.mjs";
import {
  workerDirectory,
  workerLogPath,
  workerRecordPath,
  workerStateDirectory,
  workerPathInternals,
  legacyWorkerDirectory,
} from "./worker-paths.mjs";

export const workerRegistryInternals = {
  ...workerStorageInternals,
  ...workerPathInternals,
  ...workerIndexInternals,
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
