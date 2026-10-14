import { afterEach, describe, expect, test } from "@jest/globals";
import { fs as commonFs } from "@eliware/common";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { deleteOptional, readJson, readOptionalText, writeText } from "../src/runtime-files.mjs";

const directories = [];
function tempDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentx-runtime-files-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("runtime file helpers", () => {
  test("reads and writes JSON and text files", async () => {
    const directory = tempDirectory();
    const jsonFile = path.join(directory, "value.json");
    const textFile = path.join(directory, "value.txt");
    await writeText(jsonFile, JSON.stringify({ ok: true }));
    await writeText(textFile, "hello");
    await expect(readJson(jsonFile)).resolves.toEqual({ ok: true });
    await expect(readOptionalText(textFile)).resolves.toBe("hello");
    await deleteOptional(textFile);
    await expect(readOptionalText(textFile)).resolves.toBeNull();
    await expect(deleteOptional(textFile)).resolves.toBeUndefined();
  });

  test("propagates file errors other than missing paths", async () => {
    const originalReadFile = commonFs.promises.readFile;
    const originalUnlink = commonFs.promises.unlink;
    const denied = async () => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    };
    commonFs.promises.readFile = denied;
    commonFs.promises.unlink = denied;
    try {
      await expect(readOptionalText("locked.txt")).rejects.toThrow("denied");
      await expect(deleteOptional("locked.txt")).rejects.toThrow("denied");
    } finally {
      commonFs.promises.readFile = originalReadFile;
      commonFs.promises.unlink = originalUnlink;
    }
  });
});
