import { afterEach, describe, expect, test } from "@jest/globals";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readEnvState, writeEnvState } from "../src/setup-env.mjs";

const directories = [];
async function tempDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentx-env-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("setup environment file", () => {
  test("reads missing and populated config files", async () => {
    const directory = await tempDirectory();
    const file = path.join(directory, ".agentx");
    expect((await readEnvState(file)).values).toEqual({ AGENTX_API_KEY: "" });
    await writeFile(
      file,
      "AGENTX_CONFIG_VERSION=2\nAGENTX_MODEL=gpt-6-luna\nCUSTOM=value\n# retained\n",
    );
    const upgraded = await readEnvState(file);
    expect(upgraded.values).toEqual({ AGENTX_API_KEY: "", AGENTX_MODEL: "gpt-6-luna" });
    expect(upgraded.text).toContain("CUSTOM=value");
    expect(upgraded.text).toContain("# retained");
  });

  test("writes atomically, keeps private permissions, and cleans temporary files", async () => {
    const directory = await tempDirectory();
    const file = path.join(directory, ".agentx");
    await writeEnvState(file, { AGENTX_API_KEY: "old-key" });
    await writeEnvState(file, { AGENTX_API_KEY: "new-key" });
    expect((await readEnvState(file)).values.AGENTX_API_KEY).toBe("new-key");
    expect(await readdir(directory)).toEqual([".agentx"]);
    if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(writeEnvState(directory, { AGENTX_API_KEY: "key" })).rejects.toBeTruthy();
    await expect(readEnvState(directory)).rejects.toBeTruthy();
    expect(await readFile(file, "utf8")).toContain("AGENTX_API_KEY=new-key");
  });
});
