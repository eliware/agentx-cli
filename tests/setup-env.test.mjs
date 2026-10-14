import { afterEach, describe, expect, test } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
      "AGENTX_CONFIG_VERSION=1\nAGENTX_MODEL=gpt-5.6-luna\nCUSTOM=value\n# retained\n",
    );
    const upgraded = await readEnvState(file);
    expect(upgraded.values).toEqual({ AGENTX_API_KEY: "", AGENTX_MODEL: "gpt-6-luna" });
    expect(upgraded.text).toContain("CUSTOM=value");
    expect(upgraded.text).toContain("# retained");
    expect(upgraded.text).toContain("AGENTX_CONFIG_VERSION=2");
    await expect(writeEnvState(directory, { AGENTX_API_KEY: "key" })).rejects.toBeTruthy();
    await expect(readEnvState(directory)).rejects.toBeTruthy();
  });
});
