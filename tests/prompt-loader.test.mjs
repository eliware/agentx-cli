import { describe, expect, jest, test } from "@jest/globals";
import { homedir } from "node:os";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { loadPromptTemplate } from "../src/prompt-loader.mjs";
import { cleanupTempDir, makeTempDir } from "./test-helpers.mjs";

describe("prompt loader", () => {
  test("uses the OS home fallback when the platform home is unavailable", async () => {
    jest.resetModules();
    await jest.unstable_mockModule("../src/platform.mjs", () => ({ getHomeDirectory: () => "" }));
    const readJson = jest.fn(async (filePath) => {
      if (filePath === "/prompt.json") return { input: [] };
      throw { code: "ENOENT" };
    });
    await jest.unstable_mockModule("../src/runtime.mjs", () => ({ readJson }));
    const { loadPromptTemplate: loadWithFallback } = await import("../src/prompt-loader.mjs");
    await expect(loadWithFallback("/prompt.json")).resolves.toEqual({ input: [] });
    expect(readJson.mock.calls[1][0]).toBe(path.join(homedir(), ".agentx.mcp.json"));
  });

  test("wraps prompt and malformed MCP configuration errors with the prompt path", async () => {
    const tmp = makeTempDir("agentx-prompt-error-");
    try {
      const promptPath = path.join(tmp, "prompt.json");
      const mcpPath = path.join(tmp, "mcp.json");
      writeFileSync(promptPath, "{not json");
      await expect(loadPromptTemplate(promptPath)).rejects.toThrow(
        `Unable to read prompt template at ${promptPath}`,
      );
      writeFileSync(promptPath, JSON.stringify({ input: [] }));
      writeFileSync(mcpPath, "{not json");
      await expect(loadPromptTemplate(promptPath, mcpPath)).rejects.toThrow(
        `Unable to read prompt template at ${promptPath}`,
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("merges enabled MCP entries from array or object settings and strips local controls", async () => {
    const tmp = makeTempDir("agentx-prompt-mcp-");
    try {
      const promptPath = path.join(tmp, "prompt.json");
      const mcpPath = path.join(tmp, "mcp.json");
      const nativeTool = { type: "function", name: "lookup" };
      const mcpTool = {
        type: "mcp",
        server_label: "developer",
        server_url: "https://developer.example.test/mcp",
        enabled: true,
      };
      writeFileSync(promptPath, JSON.stringify({ input: [], tools: [nativeTool] }));
      const otherTool = { type: "function", name: "remote-function" };
      writeFileSync(mcpPath, JSON.stringify([mcpTool, { ...mcpTool, enabled: false }, otherTool]));
      await expect(loadPromptTemplate(promptPath, mcpPath)).resolves.toEqual({
        input: [],
        tools: [
          nativeTool,
          { type: "mcp", server_label: "developer", server_url: mcpTool.server_url },
          otherTool,
        ],
      });
      writeFileSync(mcpPath, JSON.stringify({ tools: [mcpTool] }));
      await expect(loadPromptTemplate(promptPath, mcpPath)).resolves.toMatchObject({
        tools: [nativeTool, { type: "mcp", server_label: "developer" }],
      });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("allows missing MCP files and skips MCP reads when disabled", async () => {
    const tmp = makeTempDir("agentx-prompt-no-mcp-");
    try {
      const promptPath = path.join(tmp, "prompt.json");
      const missingMcpPath = path.join(tmp, "missing.json");
      writeFileSync(promptPath, JSON.stringify({ input: [], tools: [{ type: "function" }] }));
      await expect(loadPromptTemplate(promptPath, missingMcpPath)).resolves.toEqual({
        input: [],
        tools: [{ type: "function" }],
      });
      writeFileSync(missingMcpPath, JSON.stringify({}));
      await expect(loadPromptTemplate(promptPath, missingMcpPath)).resolves.toEqual({
        input: [],
        tools: [{ type: "function" }],
      });
      writeFileSync(promptPath, JSON.stringify({ input: [] }));
      await expect(loadPromptTemplate(promptPath, missingMcpPath)).resolves.toEqual({
        input: [],
        tools: [],
      });
      writeFileSync(promptPath, JSON.stringify({ input: [], tools: [{ type: "function" }] }));
      writeFileSync(missingMcpPath, "{invalid but ignored");
      await expect(
        loadPromptTemplate(promptPath, missingMcpPath, process.env, { loadMcp: false }),
      ).resolves.toEqual({ input: [], tools: [{ type: "function" }] });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("filters worker orchestration tools while preserving ordinary tools", async () => {
    const tmp = makeTempDir("agentx-worker-prompt-");
    try {
      const promptPath = path.join(tmp, "prompt.json");
      writeFileSync(
        promptPath,
        JSON.stringify({
          input: [],
          tools: [
            { name: "spawn_agent" },
            { name: "agent_status" },
            { name: "cancel_agent" },
            { name: "view_image" },
          ],
        }),
      );
      await expect(
        loadPromptTemplate(promptPath, path.join(tmp, "missing.json"), {
          AGENTX_WORKER_ID: "worker-1",
        }),
      ).resolves.toEqual({ input: [], tools: [{ name: "view_image" }] });
      writeFileSync(promptPath, JSON.stringify({ input: [] }));
      await expect(
        loadPromptTemplate(promptPath, path.join(tmp, "missing.json"), {
          AGENTX_WORKER_ID: "worker-1",
        }),
      ).resolves.toEqual({ input: [], tools: [] });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("returns valid prompt JSON and reports thrown non-Error values", async () => {
    const tmp = makeTempDir("agentx-prompt-valid-");
    try {
      const promptPath = path.join(tmp, "prompt.json");
      writeFileSync(promptPath, JSON.stringify({ input: [] }));
      await expect(
        loadPromptTemplate(promptPath, path.join(tmp, "missing.json"), {}),
      ).resolves.toEqual({ input: [] });
    } finally {
      cleanupTempDir(tmp);
    }

    jest.resetModules();
    await jest.unstable_mockModule("../src/runtime.mjs", () => ({
      readJson: async () => {
        throw "broken prompt";
      },
    }));
    const { loadPromptTemplate: loadWithThrownString } = await import("../src/prompt-loader.mjs");
    await expect(loadWithThrownString("/tmp/prompt.json")).rejects.toThrow("broken prompt");
  });

  test("loads the supported image-generation schema from the prompt template", async () => {
    const template = await loadPromptTemplate(
      path.resolve("prompt.json"),
      path.resolve("missing-mcp.json"),
    );
    expect(template.tools.find((tool) => tool.type === "image_generation")).toEqual({
      type: "image_generation",
    });
  });
});
