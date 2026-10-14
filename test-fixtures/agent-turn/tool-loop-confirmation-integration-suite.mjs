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

  test("handleToolCalls refuses unconfirmed state-changing calls", async () => {
    const openai = {
      responses: {
        create: testMocks.fn(async (request) => ({ id: "resp-next", output: [], request })),
      },
    };
    const response = {
      id: "resp-1",
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [
        { type: "shell_call", call_id: "call-danger", action: { commands: ["shutdown now"] } },
        { type: "shell_call", id: "call-danger-id", action: { commands: ["reboot now"] } },
        { type: "shell_call", action: { commands: ["poweroff now"] } },
      ],
    };
    const runToolCallFn = testMocks.fn();
    await handleToolCalls(
      openai,
      response,
      { model: "test-model", tools: [] },
      "/tmp/work",
      null,
      runToolCallFn,
      { yolo: false, confirmToolCall: async () => false },
    );
    expect(runToolCallFn).not.toHaveBeenCalled();
    expect(openai.responses.create.mock.calls[0][0].input).toHaveLength(3);
    expect(
      openai.responses.create.mock.calls[0][0].input.every((item) => item.status === "incomplete"),
    ).toBe(true);
  });
  test("executes destructive calls automatically when confirmation is disabled", async () => {
    const openai = {
      responses: {
        create: testMocks.fn(async (request) => ({ id: "resp-next", output: [], request })),
      },
    };
    const response = {
      id: "resp-1",
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [
        { type: "shell_call", call_id: "call-danger", action: { commands: ["shutdown now"] } },
      ],
    };
    const runToolCallFn = testMocks.fn(async (call) => ({
      type: "shell_call_output",
      call_id: call.call_id,
      output: [],
      status: "completed",
    }));
    const confirmToolCall = testMocks.fn();

    await handleToolCalls(
      openai,
      response,
      { model: "test-model", tools: [] },
      "/tmp/work",
      null,
      runToolCallFn,
      { yolo: true, confirmToolCall },
    );

    expect(runToolCallFn).toHaveBeenCalledTimes(1);
    expect(confirmToolCall).not.toHaveBeenCalled();
    expect(openai.responses.create.mock.calls[0][0].input[0].status).toBe("completed");
  });
});
