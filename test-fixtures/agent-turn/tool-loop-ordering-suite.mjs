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

  test("handleToolCalls runs multiple tool calls sequentially and preserves output order", async () => {
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
      usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1 },
      output: [
        { type: "shell_call", call_id: "call-1", action: { commands: ["one"] } },
        { type: "shell_call", call_id: "call-2", action: { commands: ["two"] } },
      ],
    };

    let active = 0;
    let maxActive = 0;
    const runToolCallFn = async (call) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, call.call_id === "call-1" ? 80 : 20));
      active -= 1;
      return {
        type: "shell_call_output",
        call_id: call.call_id,
        output: [
          { stdout: `output-${call.call_id}`, stderr: "", outcome: { type: "exit", exit_code: 0 } },
        ],
        status: "completed",
        max_output_length: null,
      };
    };

    await expect(
      handleToolCalls(
        openai,
        response,
        { model: "test-model", tools: [] },
        "/tmp/work",
        null,
        runToolCallFn,
      ),
    ).resolves.toEqual({ id: "resp-next", output: [] });

    expect(maxActive).toBe(1);
    const terminalOutput = writeTerminal.mock.calls.map(([text]) => text).join("");
    expect(terminalOutput).not.toContain("one\\n");
    expect(terminalOutput).not.toContain("two\\n");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].input.map((item) => item.call_id)).toEqual(["call-1", "call-2"]);
  });
});

test("covers missing response ids on ordinary tool continuation", async () => {
  const openai = { responses: { create: testMocks.fn().mockResolvedValue({ output: [] }) } };
  const response = {
    output: [{ type: "shell_call", call_id: "missing-id", action: { commands: ["printf x"] } }],
  };
  await expect(
    handleToolCalls(
      openai,
      response,
      { model: "test-model", tools: [] },
      "/tmp/work",
      null,
      async () => ({
        type: "shell_call_output",
        call_id: "missing-id",
        output: [],
        status: "completed",
      }),
    ),
  ).resolves.toEqual({ output: [] });
});
