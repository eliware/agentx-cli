import { describe, expect, jest as testMocks, test } from "@jest/globals";
let statusController;
const createStatusLineController = testMocks.fn(() => statusController);
const writeTerminal = testMocks.fn();

await testMocks.unstable_mockModule("../../src/terminal-output.mjs", () => ({
  isTerminalColorEnabled: () => true,
  setActiveStatusController: testMocks.fn(),
  writeTerminal,
}));
await testMocks.unstable_mockModule("../../src/agent-turn/status-controller.mjs", () => ({
  createStatusLineController,
}));
const { handleToolCalls } = await import("../../src/agent-turn/tool-loop.mjs");

describe("agent session modules", () => {
  beforeEach(() => {
    statusController = {
      showReasoning: testMocks.fn(),
      showExecuting: testMocks.fn(),
      updateExecuting: testMocks.fn(),
      beginWriting: testMocks.fn(),
      pause: testMocks.fn(),
      resume: testMocks.fn(),
      clear: testMocks.fn(),
      stop: testMocks.fn(),
      refresh: testMocks.fn(),
      isWriting: () => false,
    };
    createStatusLineController.mockClear();
    writeTerminal.mockClear();
  });

  test("handleToolCalls returns immediately when the response has no output array", async () => {
    const openai = {
      responses: {
        create: async () => {
          throw new Error("unexpected retry");
        },
      },
    };
    const response = { id: "resp-empty" };
    await expect(
      handleToolCalls(openai, response, { model: "test-model", tools: [] }, "/tmp/work", null),
    ).resolves.toBe(response);
  });
  test("handleToolCalls reports usage when a callback is provided", async () => {
    const usageCalls = [];
    const openai = {
      responses: {
        create: async () => {
          throw new Error("unexpected tool retry");
        },
      },
    };
    const response = {
      id: "resp-usage",
      output: [],
      usage: { input_tokens: 4, input_tokens_details: { cached_tokens: 1 }, output_tokens: 2 },
    };

    await expect(
      handleToolCalls(openai, response, { model: "test-model", tools: [] }, "/tmp/work", (usage) =>
        usageCalls.push(usage),
      ),
    ).resolves.toBe(response);

    expect(usageCalls).toEqual([{ inputTokens: 3, cachedTokens: 1, outputTokens: 2 }]);
  });
  test("passes the caller response predecessor to image inspection", async () => {
    const predecessors = [];
    const openai = {
      responses: {
        create: testMocks.fn().mockResolvedValue({ id: "resp-after-image", output: [] }),
      },
    };
    const response = {
      id: "resp-image-call",
      output: [{ type: "function_call", name: "view_image", call_id: "image-1", arguments: "{}" }],
    };
    await handleToolCalls(
      openai,
      response,
      { model: "test-model", tools: [], previous_response_id: "resp-before-image" },
      "/tmp/work",
      null,
      undefined,
      {
        onViewImage: async ({ previousResponseId }) => {
          predecessors.push(previousResponseId);
          return "image result";
        },
      },
    );
    expect(predecessors).toEqual(["resp-before-image"]);
    expect(openai.responses.create.mock.calls[0][0]).toMatchObject({
      previous_response_id: "resp-image-call",
      input: [{ type: "function_call_output", call_id: "image-1", output: "image result" }],
    });
  });
});
