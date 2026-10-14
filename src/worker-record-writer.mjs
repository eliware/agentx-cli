import { rename, unlink, writeFile } from "node:fs/promises";

export async function writeWorkerRecordFile(file, value, makeId) {
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
