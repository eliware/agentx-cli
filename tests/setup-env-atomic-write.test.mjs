import { afterEach, expect, test } from "@jest/globals";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeSetupEnvAtomically } from "../src/setup-env-atomic-write.mjs";

const directories = [];
async function tempDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentx-env-write-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("replaces setup files with private permissions and no temporary files", async () => {
  const directory = await tempDirectory();
  const file = path.join(directory, ".agentx");
  await writeSetupEnvAtomically(file, "old value");
  await writeSetupEnvAtomically(file, "new value");
  expect(await readFile(file, "utf8")).toBe("new value");
  expect(await readdir(directory)).toEqual([".agentx"]);
  if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
});

test("removes the temporary file when the final rename fails", async () => {
  const directory = await tempDirectory();
  await expect(writeSetupEnvAtomically(directory, "value")).rejects.toBeTruthy();
  expect(await readdir(directory)).toEqual([]);
});
