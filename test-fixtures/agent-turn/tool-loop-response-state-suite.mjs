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

  test("handleToolCalls invokes onResponseState with the current response snapshot", async () => {
    const stateCalls = [];
    const openai = {
      responses: {
        create: async () => ({ id: "resp-state", output: [] }),
      },
    };
    const response = {
      id: "resp-state",
      output: [],
      usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0 },
    };

    await expect(
      handleToolCalls(
        openai,
        response,
        { model: "test-model", tools: [] },
        "/tmp/work",
        null,
        undefined,
        { onResponseState: async (snapshot) => stateCalls.push(snapshot) },
      ),
    ).resolves.toBe(response);

    expect(stateCalls).toHaveLength(1);
    expect(stateCalls[0]).toMatchObject({
      response,
      pendingToolCalls: [],
      isInitialResponse: true,
    });
  });
  test("handleToolCalls does not emit REST-style debug logs", async () => {
    const originalArgv = [...process.argv];
    const originalConsoleLog = console.log;
    const logs = [];
    process.argv = [...process.argv, "--debug"];
    console.log = (...args) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      const openai = {
        responses: {
          create: async () => ({ id: "resp-next", output: [] }),
        },
      };
      const response = {
        id: "resp-1",
        output: [
          { type: "shell_call", call_id: "call-1", action: { commands: ['printf "tool output"'] } },
        ],
      };

      await handleToolCalls(
        openai,
        response,
        { model: "test-model", tools: [] },
        "/tmp/work",
        null,
        async () => ({
          type: "shell_call_output",
          call_id: "call-1",
          output: [],
          status: "completed",
          max_output_length: null,
        }),
      );

      expect(logs.some((line) => line.includes("OpenAI request:"))).toBe(false);
      expect(logs.some((line) => line.includes("OpenAI response:"))).toBe(false);
    } finally {
      process.argv = originalArgv;
      console.log = originalConsoleLog;
    }
  });
});
