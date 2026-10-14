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

  test("coordinates status transitions around tool execution and continuation", async () => {
    const openai = {
      responses: {
        create: testMocks
          .fn()
          .mockResolvedValueOnce({
            id: "resp-1",
            output: [
              { type: "shell_call", call_id: "call-1", action: { commands: ["one"] } },
              { type: "shell_call", call_id: "call-2", action: { commands: ["two"] } },
            ],
            usage: {
              input_tokens: 10,
              input_tokens_details: { cached_tokens: 1 },
              output_tokens: 2,
            },
          })
          .mockResolvedValueOnce({
            id: "resp-2",
            output: [],
            usage: {
              input_tokens: 4,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens: 1,
            },
          }),
      },
    };
    const response = {
      id: "resp-1",
      output: [
        { type: "shell_call", call_id: "call-1", action: { commands: ["one"] } },
        { type: "shell_call", call_id: "call-2", action: { commands: ["two"] } },
      ],
      usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 1 }, output_tokens: 2 },
    };

    const runToolCallFn = testMocks.fn(async (call) => ({
      type: "shell_call_output",
      call_id: call.call_id,
      output: [],
      status: "completed",
      max_output_length: null,
    }));

    await handleToolCalls(
      openai,
      response,
      { model: "test-model", tools: [] },
      "/tmp/work",
      null,
      runToolCallFn,
      { liveStreaming: true },
    );
    expect(runToolCallFn).toHaveBeenCalled();
    expect(statusController.showExecuting).toHaveBeenCalled();
    expect(statusController.showReasoning).toHaveBeenCalled();
    expect(statusController.clear).toHaveBeenCalled();
  });
});
