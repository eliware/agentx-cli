import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import {
  workerDirectory, workerRecordPath, workerLogPath,
  saveWorkerRecord, readWorkerRecord, appendWorkerLog, readWorkerLog,
  listWorkerRecords, cleanupWorkerRecords, workerRegistryInternals,
} from '../src/worker-registry.mjs';

async function tempCwd() { return mkdtemp(join(tmpdir(), 'agentx-worker-registry-')); }

 describe('worker registry', () => {
  test('builds paths and saves/reads records atomically', async () => {
    const cwd = await tempCwd();
    try {
      expect(workerDirectory(cwd)).toBe(join(cwd, '.agentx', 'workers'));
      expect(workerRecordPath(cwd, 'abc')).toBe(join(cwd, '.agentx', 'workers', 'abc.json'));
      expect(workerLogPath(cwd, 'abc')).toBe(join(cwd, '.agentx', 'workers', 'abc.log'));
      const record = { id: 'abc', status: 'running' };
      await saveWorkerRecord(cwd, record);
      expect(await readWorkerRecord(cwd, 'abc')).toEqual(record);
      expect(await readWorkerRecord(cwd, 'missing')).toBeNull();
      await writeFile(workerRecordPath(cwd, 'bad'), '{bad');
      await expect(readWorkerRecord(cwd, 'bad')).rejects.toThrow();
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });

  test('appends, reads, and bounds worker logs', async () => {
    const cwd = await tempCwd();
    try {
      expect(await readWorkerLog(cwd, 'missing')).toBe('');
      await mkdir(workerLogPath(cwd, 'broken'), { recursive: true });
      await expect(readWorkerLog(cwd, 'broken')).rejects.toThrow();
      await appendWorkerLog(cwd, 'abc', 'hello');
      expect(await readWorkerLog(cwd, 'abc')).toBe('hello');
      await appendWorkerLog(cwd, 'abc', 'x'.repeat(workerRegistryInternals.MAX_LOG_BYTES));
      const log = await readWorkerLog(cwd, 'abc');
      expect(Buffer.byteLength(log)).toBe(workerRegistryInternals.MAX_LOG_BYTES);
      expect(log.endsWith('x'.repeat(10))).toBe(true);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });

  test('lists valid records, ignores unrelated and corrupt files, and handles missing directory', async () => {
    const cwd = await tempCwd();
    try {
      expect(await listWorkerRecords(cwd)).toEqual([]);
      await mkdir(workerDirectory(cwd), { recursive: true });
      await writeFile(join(workerDirectory(cwd), 'a.json'), JSON.stringify({ id: 'a' }));
      await writeFile(join(workerDirectory(cwd), 'bad.json'), '{bad');
      await writeFile(join(workerDirectory(cwd), 'notes.txt'), '{}');
      expect(await listWorkerRecords(cwd)).toEqual([{ id: 'a' }]);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });

  test('cleans expired terminal records and logs', async () => {
    const cwd = await tempCwd();
    try {
      const old = new Date(Date.now() - workerRegistryInternals.RETENTION_MS - 1).toISOString();
      const records = [
        { id: 'done', status: 'completed', finished_at: old },
        { id: 'failed', status: 'failed', updated_at: old },
        { id: 'cancelled', status: 'cancelled', finished_at: old },
        { id: 'timed', status: 'timed_out', finished_at: old },
        { id: 'terminated', status: 'terminated', finished_at: old },
        { id: 'active', status: 'running', finished_at: old },
        { id: 'new', status: 'completed', finished_at: new Date().toISOString() },
        { id: 'undated', status: 'completed' },
        { id: 'badlog', status: 'completed', finished_at: old },
      ];
      for (const record of records) await saveWorkerRecord(cwd, record);
      await rm(workerRecordPath(cwd, 'badlog'));
      await mkdir(workerRecordPath(cwd, 'badlog'));
      await mkdir(workerLogPath(cwd, 'badlog'));
      await appendWorkerLog(cwd, 'done', 'log');
      await cleanupWorkerRecords(cwd);
      for (const id of ['done', 'failed', 'cancelled', 'timed', 'terminated']) {
        expect(await readWorkerRecord(cwd, id)).toBeNull();
        expect(await readWorkerLog(cwd, id)).toBe('');
      }
      expect(await readWorkerRecord(cwd, 'active')).not.toBeNull();
      expect(await readWorkerRecord(cwd, 'new')).not.toBeNull();
      expect(await readWorkerRecord(cwd, 'undated')).toBeNull();
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });

  test('propagates non-missing registry errors', async () => {
    const cwd = await tempCwd();
    try {
      await writeFile(join(cwd, '.agentx'), 'not a directory');
      await expect(listWorkerRecords(cwd)).rejects.toThrow();
      await expect(saveWorkerRecord(cwd, { id: 'x' })).rejects.toThrow();
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
});
