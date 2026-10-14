import { describe, expect, jest, test } from "@jest/globals";
import { createStreamedResponse } from "../../src/agent-turn/response-stream.mjs";

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

  test.each([
    ["hello", `\x1b[38;5;255mhello\x1b[0m\n`],
    ["hello\n", `\x1b[38;5;255mhello\n\x1b[0m`],
  ])("streams %j with the expected line ending", async (text, expected) => {
    const statusController = {
      showReasoning: jest.fn(),
      beginWriting: jest.fn(),
      clear: jest.fn(),
    };
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers.onTextDelta(text);
          return { id: "resp-live" };
        },
      },
    };
    await expect(
      createStreamedResponse(openai, {}, { liveStreaming: true, statusController }),
    ).resolves.toEqual({ id: "resp-live" });
    expect(statusController.showReasoning).toHaveBeenCalled();
    expect(statusController.clear).toHaveBeenCalled();
    expect(stdoutWrites.join("")).toBe(expected);
  });

  test("uses default response options when the stream helper receives no options", async () => {
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          expect(handlers).toBeUndefined();
          return { id: "resp-default" };
        },
      },
    };
    await expect(createStreamedResponse(openai, {})).resolves.toEqual({ id: "resp-default" });
  });

  test("does not emit a color reset when colors are disabled", async () => {
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers.onTextDelta("hello");
          return { id: "resp-no-colors" };
        },
      },
    };
    await createStreamedResponse(openai, {}, { liveStreaming: true, colors: false });
    expect(stdoutWrites.join("")).not.toContain("\u001b[0m");
  });

  test("clears status when the response request fails", async () => {
    const statusController = { showReasoning: jest.fn(), clear: jest.fn() };
    const error = new Error("transport failed");
    const openai = {
      responses: {
        create: async () => {
          throw error;
        },
      },
    };
    await expect(
      createStreamedResponse(openai, {}, { liveStreaming: true, statusController }),
    ).rejects.toBe(error);
    expect(statusController.clear).toHaveBeenCalledTimes(1);
  });

  test("passes debug event handlers to the response API", async () => {
    const create = jest.fn(async (_request, handlers) => {
      expect(handlers.onEvent).toEqual(expect.any(Function));
      return { id: "resp-debug" };
    });
    await expect(
      createStreamedResponse({ responses: { create } }, {}, { debug: true }),
    ).resolves.toEqual({ id: "resp-debug" });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
