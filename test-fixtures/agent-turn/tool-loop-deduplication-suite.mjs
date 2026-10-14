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

  test("handleToolCalls executes duplicate calls only once", async () => {
    const createCalls = [];
    const openai = {
      responses: {
        create: async (request) => {
          createCalls.push(request);
          return { id: "resp-next", output: [] };
        },
      },
    };
    const response = {
      id: "resp-1",
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [
        { type: "shell_call", call_id: "call-1", action: { commands: ["one"] } },
        { type: "shell_call", call_id: "call-1", action: { commands: ["one"] } },
      ],
    };
    const runToolCallFn = testMocks.fn(async (call) => ({
      type: "shell_call_output",
      call_id: call.call_id,
      output: [],
      status: "completed",
    }));

    await handleToolCalls(
      openai,
      response,
      { model: "test-model", tools: [] },
      "/tmp/work",
      null,
      runToolCallFn,
    );

    expect(runToolCallFn).toHaveBeenCalledTimes(1);
    expect(createCalls[0].input).toHaveLength(1);
  });
});
