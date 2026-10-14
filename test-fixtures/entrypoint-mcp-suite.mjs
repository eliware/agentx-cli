import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import path from "node:path";
import * as realFs from "node:fs";
import { cleanupTempDir, makeTempDir } from "./test-helpers.mjs";

describe("entrypoint", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("agentx.mjs validates a valid MCP config without starting AgentX", async () => {
    const tempHome = makeTempDir("agentx-main-mcp-");
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exit = jest.fn();
    process.argv = [process.argv[0], process.argv[1], "--check-mcp"];
    realFs.writeFileSync(
      path.join(tempHome, ".agentx.mcp.json"),
      JSON.stringify([
        {
          type: "mcp",
          server_label: "test",
          server_url: "https://example.test/mcp",
          headers: { Authorization: "Bearer hidden" },
        },
      ]),
    );

    try {
      await jest.unstable_mockModule("../src/platform.mjs", () => ({
        getHomeDirectory: () => tempHome,
      }));
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

      await import("../src/agent-entrypoint.mjs");

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join("")).toContain("MCP config valid: 1 MCP tool configured");
      expect(writes.join("")).not.toContain("hidden");
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
      cleanupTempDir(tempHome);
    }
  });
  test("agentx.mjs returns failure for invalid MCP config", async () => {
    const tempHome = makeTempDir("agentx-main-mcp-invalid-");
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exit = jest.fn();
    process.argv = [process.argv[0], process.argv[1], "-K"];
    realFs.writeFileSync(
      path.join(tempHome, ".agentx.mcp.json"),
      JSON.stringify([{ type: "mcp", server_label: "bad", server_url: "http://bad/mcp" }]),
    );

    try {
      await jest.unstable_mockModule("../src/platform.mjs", () => ({
        getHomeDirectory: () => tempHome,
      }));
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

      await import("../src/agent-entrypoint.mjs");

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join("")).toContain("MCP config invalid");
      expect(process.exit).toHaveBeenCalledWith(1);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
      cleanupTempDir(tempHome);
    }
  });
  test("agentx.mjs checks MCP config from the launch directory when home is unavailable", async () => {
    const tempHome = makeTempDir("agentx-main-mcp-cwd-");
    const originalCwd = process.cwd();
    const writes = [];
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    const originalArgv = [...process.argv];
    realFs.writeFileSync(path.join(tempHome, ".agentx.mcp.json"), "[]");
    process.chdir(tempHome);
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exit = jest.fn();
    process.argv = [process.argv[0], process.argv[1], "--check-mcp"];

    try {
      await jest.unstable_mockModule("../src/platform.mjs", () => ({ getHomeDirectory: () => "" }));
      await jest.unstable_mockModule("../src/runtime.mjs", () => ({
        isDirectInvocation: () => true,
        promptPath: "/tmp/prompt.json",
      }));
      const runAgent = jest.fn();
      await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent }));

      await import("../src/agent-entrypoint.mjs");

      expect(runAgent).not.toHaveBeenCalled();
      expect(writes.join("")).toContain("no MCP tools configured");
      expect(process.exit).toHaveBeenCalledWith(0);
    } finally {
      process.chdir(originalCwd);
      process.stdout.write = originalWrite;
      process.exit = originalExit;
      process.argv = originalArgv;
      cleanupTempDir(tempHome);
    }
  });
});
