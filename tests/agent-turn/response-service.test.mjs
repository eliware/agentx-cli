import { describe, expect, jest, test } from "@jest/globals";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { sendMessage } from "../../src/agent-turn/response-service.mjs";
import { loadPromptTemplate } from "../../src/prompt-loader.mjs";
import { cleanupTempDir, makeTempDir } from "../../test-fixtures/test-helpers.mjs";

describe("agent session modules", () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  test("disabled MCP loading omits MCP tools from the outgoing request", async () => {
    const tmp = makeTempDir("agentx-request-no-mcp-");
    try {
      const promptPath = path.join(tmp, "prompt.json");
      const mcpPath = path.join(tmp, "mcp.json");
      const mcpTool = {
        type: "mcp",
        server_label: "developer",
        server_url: "https://developer.example.test/mcp",
        enabled: true,
      };
      writeFileSync(
        promptPath,
        JSON.stringify({
          model: "test-model",
          input: [],
          tools: [{ type: "function", name: "local" }],
        }),
      );
      writeFileSync(mcpPath, JSON.stringify([mcpTool]));
      const enabledTemplate = await loadPromptTemplate(promptPath, mcpPath);
      const disabledTemplate = await loadPromptTemplate(promptPath, mcpPath, process.env, {
        loadMcp: false,
      });
      const requests = [];
      const openai = {
        responses: {
          create: async (request) => {
            requests.push(request);
            return { id: `resp-${requests.length}`, output: [] };
          },
        },
      };

      await sendMessage(openai, enabledTemplate, "", "hello", "", "/tmp/work");
      await sendMessage(openai, disabledTemplate, "", "hello", "", "/tmp/work");

      expect(requests[0].tools).toEqual([
        { type: "function", name: "local" },
        {
          type: "mcp",
          server_label: "developer",
          server_url: "https://developer.example.test/mcp",
        },
      ]);
      expect(requests[1].tools).toEqual([{ type: "function", name: "local" }]);
    } finally {
      cleanupTempDir(tmp);
    }
  });
  test("sendMessage stops status controller when streaming fails", async () => {
    const statusController = { showReasoning: jest.fn(), clear: jest.fn(), stop: jest.fn() };
    const openai = {
      responses: { create: jest.fn().mockRejectedValue(new Error("stream failed")) },
    };
    await expect(
      sendMessage(
        openai,
        { model: "test-model", input: [], tools: [] },
        "",
        "hello",
        "",
        "/tmp/work",
        null,
        null,
        { statusController },
      ),
    ).rejects.toThrow("stream failed");
    expect(statusController.stop).toHaveBeenCalledTimes(1);
  });
});
