import { afterEach, describe, expect, test } from "@jest/globals";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readEnvState, setupEnvInternals, writeEnvState } from "../src/setup-env.mjs";

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
  test("parses dotenv-like pairs while preserving raw lines", () => {
    expect(setupEnvInternals.parseEnvLines("A=1\n# note\nBAD LINE")).toEqual([
      { type: "pair", key: "A", value: "1", line: "A=1" },
      { type: "raw", line: "# note" },
      { type: "raw", line: "BAD LINE" },
    ]);
    expect(setupEnvInternals.parseEnvLines(null)).toEqual([{ type: "raw", line: "" }]);
    expect(setupEnvInternals.decodeEnvValue(' "hello" ')).toBe("hello");
    expect(setupEnvInternals.decodeEnvValue('"bad')).toBe('"bad');
    expect(setupEnvInternals.decodeEnvValue('"bad\n"')).toBe("bad\n");
    expect(setupEnvInternals.decodeEnvValue(" plain ")).toBe("plain");
    expect(setupEnvInternals.decodeEnvValue(null)).toBe("");
  });

  test("serializes updates, collapses duplicate keys, and retains comments", () => {
    expect(setupEnvInternals.serializeEnvValue("")).toBe("");
    expect(setupEnvInternals.serializeEnvValue(null)).toBe("");
    expect(setupEnvInternals.serializeEnvValue("safe-1:/")).toBe("safe-1:/");
    expect(setupEnvInternals.serializeEnvValue('needs "quotes" \\')).toBe(
      '"needs \\"quotes\\" \\\\"',
    );
    expect(
      setupEnvInternals.updateEnvText("A=old\nA=duplicate\n# keep\n", {
        A: "new",
        B: "two words",
      }),
    ).toBe('A=new\n# keep\n\nB="two words"\n');
    expect(setupEnvInternals.updateEnvText("", { A: "1" })).toBe("A=1\n");
    expect(setupEnvInternals.updateEnvText("", {})).toBe("");
    expect(setupEnvInternals.updateEnvText(null, {})).toBe("");
  });

  test("reads missing/populated config and upgrades only the legacy default", async () => {
    const directory = await tempDirectory();
    const file = path.join(directory, ".agentx");
    expect((await readEnvState(file)).values).toEqual({ AGENTX_API_KEY: "" });
    await writeFile(
      file,
      "AGENTX_CONFIG_VERSION=1\nAGENTX_MODEL=gpt-5.6-luna\nCUSTOM=value\n# retained\n",
    );
    const upgraded = await readEnvState(file);
    expect(upgraded.values).toEqual({ AGENTX_API_KEY: "", AGENTX_MODEL: "gpt-6-luna" });
    expect(upgraded.text).toContain("AGENTX_MODEL=gpt-6-luna");
    expect(upgraded.text).toContain("CUSTOM=value");
    expect(upgraded.text).toContain("# retained");

    await writeFile(file, "AGENTX_CONFIG_VERSION=1\nAGENTX_MODEL=gpt-5.6-terra\n");
    expect((await readEnvState(file)).values.AGENTX_MODEL).toBe("gpt-5.6-terra");
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
