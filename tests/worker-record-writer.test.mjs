import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@jest/globals";
import { writeWorkerRecordFile } from "../src/worker-record-writer.mjs";

test("removes a temporary record after an atomic rename fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agentx-record-write-"));
  try {
    const target = join(directory, "blocked");
    await mkdir(target);
    await expect(
      writeWorkerRecordFile(target, { id: "blocked" }, () => "temp"),
    ).rejects.toBeTruthy();
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
