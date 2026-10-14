import { chmod, mkdtemp, mkdir, readFile, stat, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import {
  workerDirectory,
  workerRecordPath,
  workerLogPath,
  saveWorkerRecord,
  readWorkerRecord,
  appendWorkerLog,
  readWorkerLog,
  listWorkerRecords,
  cleanupWorkerRecords,
  workerRegistryInternals,
} from "../src/worker-registry.mjs";

let stateRoot;
let stateEnvKey;
let previousStateRoot;

beforeEach(async () => {
  stateRoot = await mkdtemp(join(tmpdir(), "agentx-worker-state-"));
  stateEnvKey = process.platform === "win32" ? "LOCALAPPDATA" : "XDG_STATE_HOME";
  previousStateRoot = process.env[stateEnvKey];
  process.env[stateEnvKey] = stateRoot;
});

afterEach(async () => {
  if (previousStateRoot === undefined) delete process.env[stateEnvKey];
  else process.env[stateEnvKey] = previousStateRoot;
  await rm(stateRoot, { recursive: true, force: true });
});

async function tempCwd() {
  return mkdtemp(join(tmpdir(), "agentx-worker-registry-"));
}

describe("worker registry", () => {
  test("builds paths and saves/reads records atomically", async () => {
    const cwd = await tempCwd();
    try {
      expect(workerDirectory(cwd)).toContain(join("workers", ""));
      expect(workerDirectory(cwd)).not.toContain(join(cwd, ".agentx"));
      expect(workerRecordPath(cwd, "abc")).toBe(join(workerDirectory(cwd), "abc.json"));
      expect(workerLogPath(cwd, "abc")).toBe(join(workerDirectory(cwd), "abc.log"));
      const record = { id: "abc", status: "running" };
      await saveWorkerRecord(cwd, record);
      expect(await readWorkerRecord(cwd, "abc")).toEqual(record);
      expect(await readWorkerRecord(cwd, "missing")).toBeNull();
      await writeFile(workerRecordPath(cwd, "bad"), "{bad");
      await expect(readWorkerRecord(cwd, "bad")).rejects.toThrow();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("keeps home config files untouched and isolates distinct project state", async () => {
    const home = await tempCwd();
    const otherProject = await tempCwd();
    const config = join(home, ".agentx");
    try {
      await writeFile(config, "AGENTX_API_KEY=do-not-touch\n");
      const record = { id: "home-worker", cwd: home, status: "running" };
      await saveWorkerRecord(home, record);
      await appendWorkerLog(home, record.id, "worker output");
      expect(await readWorkerRecord(home, record.id)).toEqual(record);
      expect(await readWorkerLog(home, record.id)).toBe("worker output");
      expect(await readFile(config, "utf8")).toBe("AGENTX_API_KEY=do-not-touch\n");
      expect(workerDirectory(home)).not.toBe(workerDirectory(otherProject));
      expect(await listWorkerRecords(otherProject)).toEqual([]);
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(otherProject, { recursive: true, force: true });
    }
  });

  test("uses platform state roots and stable canonical-cwd hashes", async () => {
    expect(
      workerRegistryInternals.workerStateDirectory(
        { LOCALAPPDATA: "C:\\fixtures\\example\\Local" },
        "win32",
        "C:\\fixtures\\example",
      ),
    ).toBe(join("C:\\fixtures\\example\\Local", "AgentX", "State"));
    expect(workerRegistryInternals.workerStateDirectory({}, "darwin", "/workspace/example")).toBe(
      join("/workspace/example", "Library", "Application Support", "AgentX", "State"),
    );
    expect(
      workerRegistryInternals.workerStateDirectory(
        { XDG_STATE_HOME: "/state/custom" },
        "linux",
        "/workspace/example",
      ),
    ).toBe(join("/state/custom", "agentx"));
    expect(workerRegistryInternals.workerStateDirectory({}, "linux", "/workspace/example")).toBe(
      join("/workspace/example", ".local", "state", "agentx"),
    );
    expect(
      workerRegistryInternals.workerStateDirectory(
        { XDG_STATE_HOME: "C:\\state\\xdg" },
        "win32",
        "C:\\fixtures\\example",
      ),
    ).toBe(join("C:\\state\\xdg", "AgentX", "State"));
    expect(workerRegistryInternals.workerStateDirectory({}, "win32", "C:\\fixtures\\example")).toBe(
      join("C:\\fixtures\\example", "AppData", "Local", "AgentX", "State"),
    );
    const cwd = await tempCwd();
    try {
      const casePath = join(cwd, "case-path");
      expect(workerDirectory(cwd)).toBe(workerDirectory(cwd));
      expect(workerDirectory(join(cwd, "missing"))).not.toBe(workerDirectory(cwd));
      expect(workerDirectory(casePath, "win32", "/state")).toBe(
        workerDirectory(join(cwd, "CASE-PATH"), "win32", "/state"),
      );
      expect(workerDirectory(casePath, "linux", "/state")).not.toBe(
        workerDirectory(join(cwd, "CASE-PATH"), "linux", "/state"),
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("creates private state directories and files on POSIX", async () => {
    const cwd = await tempCwd();
    try {
      await saveWorkerRecord(cwd, { id: "private", status: "running" });
      await appendWorkerLog(cwd, "private", "private log");
      if (process.platform !== "win32") {
        expect((await stat(workerDirectory(cwd))).mode & 0o777).toBe(0o700);
        expect((await stat(workerRecordPath(cwd, "private"))).mode & 0o777).toBe(0o600);
        expect((await stat(workerLogPath(cwd, "private"))).mode & 0o777).toBe(0o600);
        await chmod(workerDirectory(cwd), 0o755);
        await saveWorkerRecord(cwd, { id: "private", status: "running" });
        expect((await stat(workerDirectory(cwd))).mode & 0o777).toBe(0o700);
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("skips POSIX chmod for a Windows state directory", async () => {
    const directory = await tempCwd();
    try {
      await workerRegistryInternals.secureDirectory(join(directory, "windows"), "win32");
      expect(await stat(join(directory, "windows"))).toBeTruthy();
      await workerRegistryInternals.secureDirectory(join(directory, "posix"), "linux");
      expect(await stat(join(directory, "posix"))).toBeTruthy();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("appends, reads, and bounds worker logs", async () => {
    const cwd = await tempCwd();
    try {
      expect(await readWorkerLog(cwd, "missing")).toBe("");
      await mkdir(workerLogPath(cwd, "broken"), { recursive: true });
      await expect(readWorkerLog(cwd, "broken")).rejects.toThrow();
      await appendWorkerLog(cwd, "abc", "hello");
      expect(await readWorkerLog(cwd, "abc")).toBe("hello");
      await appendWorkerLog(cwd, "abc", "x".repeat(workerRegistryInternals.MAX_LOG_BYTES));
      const log = await readWorkerLog(cwd, "abc");
      expect(Buffer.byteLength(log)).toBe(workerRegistryInternals.MAX_LOG_BYTES);
      expect(log.endsWith("x".repeat(10))).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("lists valid records, ignores unrelated and corrupt files, and handles missing directory", async () => {
    const cwd = await tempCwd();
    try {
      expect(await listWorkerRecords(cwd)).toEqual([]);
      await mkdir(join(cwd, ".agentx"), { recursive: true });
      expect(await listWorkerRecords(cwd)).toEqual([]);
      await writeFile(join(cwd, ".agentx", "workers"), "not a directory");
      expect(await listWorkerRecords(cwd)).toEqual([]);
      await rm(join(cwd, ".agentx", "workers"));
      await mkdir(workerDirectory(cwd), { recursive: true });
      await writeFile(join(workerDirectory(cwd), "a.json"), JSON.stringify({ id: "a" }));
      await writeFile(join(workerDirectory(cwd), "mismatch.json"), JSON.stringify({ id: "other" }));
      await writeFile(join(workerDirectory(cwd), "bad.json"), "{bad");
      await writeFile(join(workerDirectory(cwd), "bad.id.json"), JSON.stringify({ id: "bad.id" }));
      await writeFile(join(workerDirectory(cwd), "notes.txt"), "{}");
      expect(await listWorkerRecords(cwd)).toEqual([{ id: "a" }]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("propagates unexpected registry directory read errors", async () => {
    const error = Object.assign(new Error("permission denied"), { code: "EACCES" });
    await expect(
      workerRegistryInternals.recordsIn("/unreadable", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  test("cleans expired terminal records and logs", async () => {
    const cwd = await tempCwd();
    try {
      const old = new Date(Date.now() - workerRegistryInternals.RETENTION_MS - 1).toISOString();
      const records = [
        { id: "done", status: "completed", finished_at: old },
        { id: "failed", status: "failed", updated_at: old },
        { id: "cancelled", status: "cancelled", finished_at: old },
        { id: "timed", status: "timed_out", finished_at: old },
        { id: "terminated", status: "terminated", finished_at: old },
        { id: "active", status: "running", finished_at: old },
        { id: "new", status: "completed", finished_at: new Date().toISOString() },
        { id: "undated", status: "completed" },
        { id: "badlog", status: "completed", finished_at: old },
      ];
      for (const record of records) await saveWorkerRecord(cwd, record);
      await rm(workerRecordPath(cwd, "badlog"));
      await mkdir(workerRecordPath(cwd, "badlog"));
      await mkdir(workerLogPath(cwd, "badlog"));
      await appendWorkerLog(cwd, "done", "log");
      await cleanupWorkerRecords(cwd);
      for (const id of ["done", "failed", "cancelled", "timed", "terminated"]) {
        expect(await readWorkerRecord(cwd, id)).toBeNull();
        expect(await readWorkerLog(cwd, id)).toBe("");
      }
      expect(await readWorkerRecord(cwd, "active")).not.toBeNull();
      expect(await readWorkerRecord(cwd, "new")).not.toBeNull();
      expect(await readWorkerRecord(cwd, "undated")).toBeNull();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("reads and cleans legacy records without touching unrelated files", async () => {
    const cwd = await tempCwd();
    const legacy = join(cwd, ".agentx", "workers");
    try {
      await mkdir(legacy, { recursive: true });
      const old = new Date(Date.now() - workerRegistryInternals.RETENTION_MS - 1).toISOString();
      await writeFile(
        join(legacy, "legacy.json"),
        JSON.stringify({
          id: "legacy",
          status: "completed",
          cwd,
          finished_at: old,
        }),
      );
      await writeFile(join(legacy, "legacy.log"), "legacy log");
      await writeFile(join(legacy, "keep.txt"), "unrelated");
      expect(await readWorkerRecord(cwd, "legacy")).toMatchObject({ id: "legacy" });
      expect(await readWorkerLog(cwd, "legacy")).toBe("legacy log");
      expect(await listWorkerRecords(cwd)).toMatchObject([{ id: "legacy" }]);
      await cleanupWorkerRecords(cwd);
      expect(await readWorkerRecord(cwd, "legacy")).toBeNull();
      expect(await readFile(join(legacy, "keep.txt"), "utf8")).toBe("unrelated");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("uses the private registry when the working directory has a .agentx file", async () => {
    const cwd = await tempCwd();
    try {
      await writeFile(join(cwd, ".agentx"), "not a directory");
      expect(await listWorkerRecords(cwd)).toEqual([]);
      await saveWorkerRecord(cwd, { id: "x", status: "running" });
      expect(await readWorkerRecord(cwd, "x")).toMatchObject({ status: "running" });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects unsafe worker IDs instead of addressing unrelated files", async () => {
    const cwd = await tempCwd();
    try {
      expect(() => workerRecordPath(cwd, "../outside")).toThrow("Invalid worker ID");
      await expect(readWorkerRecord(cwd, "../outside")).rejects.toThrow("Invalid worker ID");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("cleans temporary record files when the destination rename fails", async () => {
    const cwd = await tempCwd();
    try {
      await mkdir(workerDirectory(cwd), { recursive: true });
      await mkdir(workerRecordPath(cwd, "rename-fails"));
      await expect(saveWorkerRecord(cwd, { id: "rename-fails" })).rejects.toBeTruthy();
      const files = await (await import("node:fs/promises")).readdir(workerDirectory(cwd));
      expect(files.filter((name) => name.endsWith(".tmp"))).toEqual([]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
