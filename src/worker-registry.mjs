import { mkdir, readFile, rename, writeFile, appendFile, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOG_BYTES = 10 * 1024 * 1024;

export function workerDirectory(cwd) { return join(cwd, '.agentx', 'workers'); }
export function workerRecordPath(cwd, id) { return join(workerDirectory(cwd), `${id}.json`); }
export function workerLogPath(cwd, id) { return join(workerDirectory(cwd), `${id}.log`); }

async function ensure(cwd) { await mkdir(workerDirectory(cwd), { recursive: true }); }
async function atomicWrite(file, value) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2));
  await rename(temp, file);
}

export async function saveWorkerRecord(cwd, record) { await ensure(cwd); await atomicWrite(workerRecordPath(cwd, record.id), record); }
export async function readWorkerRecord(cwd, id) {
  try { return JSON.parse(await readFile(workerRecordPath(cwd, id), 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}
export async function appendWorkerLog(cwd, id, chunk) {
  await ensure(cwd);
  const file = workerLogPath(cwd, id);
  await appendFile(file, chunk);
  try {
    const info = await stat(file);
    if (info.size > MAX_LOG_BYTES) {
      const data = await readFile(file);
      await writeFile(file, data.subarray(data.length - MAX_LOG_BYTES));
    }
  } catch { /* best effort logging */ }
}
export async function readWorkerLog(cwd, id) { try { return await readFile(workerLogPath(cwd, id), 'utf8'); } catch (error) { if (error?.code === 'ENOENT') return ''; throw error; } }
export async function listWorkerRecords(cwd) {
  try {
    const agentxDirectory = await stat(join(cwd, '.agentx'));
    if (!agentxDirectory.isDirectory()) throw new Error(`Worker registry parent is not a directory: ${join(cwd, '.agentx')}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  try {
    const names = await readdir(workerDirectory(cwd));
    const records = [];
    for (const name of names.filter((item) => item.endsWith('.json'))) {
      try { records.push(JSON.parse(await readFile(join(workerDirectory(cwd), name), 'utf8'))); } catch { /* ignore corrupt records */ }
    }
    return records;
  } catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
}
export async function cleanupWorkerRecords(cwd, now = Date.now()) {
  const records = await listWorkerRecords(cwd);
  for (const record of records) {
    if (['completed', 'failed', 'cancelled', 'timed_out', 'terminated'].includes(record.status)
      && now - new Date(record.finished_at || record.updated_at || 0).getTime() >= RETENTION_MS) {
      await Promise.allSettled([unlink(workerRecordPath(cwd, record.id)), unlink(workerLogPath(cwd, record.id))]);
    }
  }
}
export const workerRegistryInternals = { RETENTION_MS, MAX_LOG_BYTES };
