import { describe, expect, jest, test } from "@jest/globals";
import { sendMessage } from "../../src/agent-turn/response-service.mjs";
import { createStatusLineController } from "../../src/agent-turn/status-controller.mjs";

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

  test("sendMessage pauses live status during web search events and resumes reasoning after completion", async () => {
    jest.useFakeTimers({ now: Date.parse("2026-07-08T00:00:00Z") });
    const statusController = createStatusLineController(Date.now());
    try {
      const template = { model: "test-model", input: [], tools: [] };
      let handlers;
      let resolveResponse;
      const openai = {
        responses: {
          create: async (_request, nextHandlers) => {
            handlers = nextHandlers;
            return await new Promise((resolve) => {
              resolveResponse = resolve;
            });
          },
        },
      };

      const pending = sendMessage(
        openai,
        template,
        "",
        "hello",
        "AGENTS body",
        "/tmp/work",
        null,
        null,
        { liveStreaming: true, statusController },
      );

      expect(stdoutWrites.join("")).toContain('{"time":"0s"');

      handlers.onEvent(
        { type: "response.web_search_call.in_progress" },
        { raw: '{"type":"response.web_search_call.in_progress"}' },
      );
      handlers.onEvent(
        { type: "response.web_search_call.searching" },
        { raw: '{"type":"response.web_search_call.searching"}' },
      );

      const writeCount = stdoutWrites.length;
      await jest.advanceTimersByTimeAsync(1000);
      expect(stdoutWrites.length).toBe(writeCount);

      handlers.onItemDone({
        type: "web_search_call",
        action: {
          queries: ["alpha"],
          sources: [{ type: "url", url: "https://example.com" }],
        },
      });

      const output = stdoutWrites.join("");
      expect(output).toContain('[38;5;213m{"web_search":"in_progress"}[0m');
      expect(output).toContain('[38;5;213m{"web_search":"searching"}[0m');
      expect(output).toContain('\u001b[38;5;213m{\n  "web_search": "complete",');
      expect(output).toContain(`"queries": [
    "alpha"
  ]`);
      expect(output).toContain(`"sources": [
    "https://example.com"
  ]`);
      expect(output).toContain('[32m"reasoning":"0s/0s"[38;5;255m');

      const beforeBlank = stdoutWrites.length;
      handlers.onItemDone({ type: "web_search_call", action: { queries: [], sources: [] } });
      expect(stdoutWrites.length).toBe(beforeBlank);

      resolveResponse({ id: "resp-live", output: [] });
      await pending;
    } finally {
      statusController.stop();
      jest.useRealTimers();
    }
  });
  test("sendMessage shows live stats until the first streamed delta and formats long waits as minutes", async () => {
    jest.useFakeTimers({ now: Date.parse("2026-07-08T00:00:00Z") });
    const statusController = createStatusLineController(Date.now());
    try {
      const template = { model: "test-model", input: [], tools: [] };
      let handlers;
      let resolveResponse;
      const openai = {
        responses: {
          create: async (_request, nextHandlers) => {
            handlers = nextHandlers;
            return await new Promise((resolve) => {
              resolveResponse = resolve;
            });
          },
        },
      };

      const pending = sendMessage(
        openai,
        template,
        "",
        "hello",
        "AGENTS body",
        "/tmp/work",
        null,
        null,
        { liveStreaming: true, statusController },
      );

      expect(stdoutWrites.join("")).toContain(
        '{"time":"0s",\u001b[32m"reasoning":"0s/0s"\u001b[38;5;255m,"writing":"0s/0s"',
      );

      await jest.advanceTimersByTimeAsync(1000);
      expect(stdoutWrites.join("")).toContain('{"time":"1s"');

      handlers.onTextDelta("Hi");
      resolveResponse({ id: "resp-live", output: [] });
      await pending;

      const output = stdoutWrites.join("");
      expect(output).toContain("Hi");
      expect(output).toContain('\u001b[38;5;255m{"time":');
    } finally {
      statusController.stop();
      jest.useRealTimers();
    }
  });
});
