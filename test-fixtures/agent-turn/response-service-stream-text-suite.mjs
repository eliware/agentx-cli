import { describe, expect, test } from "@jest/globals";
import { sendMessage } from "../../src/agent-turn/response-service.mjs";

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

  test("sendMessage appends a newline after live streamed text when needed", async () => {
    const template = { model: "test-model", input: [], tools: [] };
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers?.onTextDelta("done");
          return { id: "resp-live", output: [] };
        },
      },
    };

    await sendMessage(openai, template, "", "hello", "AGENTS body", "/tmp/work", null, null, {
      liveStreaming: true,
    });

    expect(stdoutWrites.join("")).toContain(`done\x1b[0m\n`);
  });
  test("sendMessage does not append an extra newline when streamed text already ends with one", async () => {
    const template = { model: "test-model", input: [], tools: [] };
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers?.onTextDelta("done\n");
          return { id: "resp-live", output: [] };
        },
      },
    };

    await sendMessage(openai, template, "", "hello", "AGENTS body", "/tmp/work", null, null, {
      liveStreaming: true,
    });

    expect(stdoutWrites.join("")).toContain(`done\n\x1b[0m`);
    expect(stdoutWrites.join("")).not.toContain("done\n\n");
  });
});
