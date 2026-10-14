import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@jest/globals";
import {
  appendWorkerLog,
  readWorkerLog,
  readWorkerRecord,
  saveWorkerRecord,
} from "../src/worker-registry.mjs";

test("coordinates worker records and logs without changing project config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "agentx-worker-registry-"));
  const config = join(cwd, ".agentx");
  try {
    await writeFile(config, "AGENTX_API_KEY=keep\n");
    const record = { id: "worker-1", cwd, status: "running" };
    await saveWorkerRecord(cwd, record);
    await appendWorkerLog(cwd, record.id, "worker output");
    await expect(readWorkerRecord(cwd, record.id)).resolves.toEqual(record);
    await expect(readWorkerLog(cwd, record.id)).resolves.toBe("worker output");
    await expect(readFile(config, "utf8")).resolves.toBe("AGENTX_API_KEY=keep\n");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
