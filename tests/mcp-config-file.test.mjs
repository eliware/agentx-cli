import { describe, expect, jest, test } from "@jest/globals";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { validateMcpConfigFile } from "../src/mcp-config-file.mjs";
import { cleanupTempDir, makeTempDir } from "./test-helpers.mjs";

describe("MCP config file loading", () => {
  test("loads and validates JSON from the file boundary", () => {
    const readFile = jest.fn(() => JSON.stringify({ tools: [] }));
    expect(validateMcpConfigFile("mcp.json", readFile)).toMatchObject({
      valid: true,
      exists: true,
      tools: [],
      filePath: "mcp.json",
    });
    expect(readFile).toHaveBeenCalledWith("mcp.json", "utf8");
  });

  test("reads the real file when no reader is injected", () => {
    const directory = makeTempDir("agentx-mcp-file-");
    try {
      const filePath = path.join(directory, "mcp.json");
      writeFileSync(filePath, JSON.stringify([]));
      expect(validateMcpConfigFile(filePath)).toMatchObject({ valid: true, exists: true });
    } finally {
      cleanupTempDir(directory);
    }
  });

  test("treats missing files as absent but reports parse and read failures", () => {
    expect(
      validateMcpConfigFile("missing.json", () => {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }),
    ).toMatchObject({ valid: true, exists: false, errors: [] });
    expect(validateMcpConfigFile("bad.json", () => "{").errors[0]).toContain(
      "unable to read config:",
    );
    expect(
      validateMcpConfigFile("denied.json", () => {
        throw { code: "EIO" };
      }).errors,
    ).toEqual(["unable to read config: [object Object]"]);
  });
});
