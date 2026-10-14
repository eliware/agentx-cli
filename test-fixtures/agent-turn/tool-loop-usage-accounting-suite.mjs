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

  test("handleToolCalls forwards each response to cumulative usage accounting", async () => {
    const cumulative = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 };
    const reportedUsages = [];
    const openai = {
      responses: {
        create: testMocks
          .fn()
          .mockResolvedValueOnce({
            id: "resp-1",
            output: [
              {
                type: "shell_call",
                call_id: "call-1",
                action: { commands: ['printf "tool output"'] },
              },
            ],
            usage: {
              input_tokens: 10,
              input_tokens_details: { cached_tokens: 4 },
              output_tokens: 6,
            },
          })
          .mockResolvedValueOnce({
            id: "resp-2",
            output: [],
            usage: {
              input_tokens: 8,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens: 2,
            },
          }),
      },
    };
    const response = {
      id: "resp-usage",
      output: [
        { type: "shell_call", call_id: "call-1", action: { commands: ['printf "tool output"'] } },
      ],
      usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 4 }, output_tokens: 6 },
    };

    await handleToolCalls(
      openai,
      response,
      { model: "test-model", tools: [] },
      "/tmp/work",
      (usage) => {
        reportedUsages.push(usage);
        cumulative.inputTokens += usage.inputTokens;
        cumulative.cachedTokens += usage.cachedTokens;
        cumulative.outputTokens += usage.outputTokens;
        cumulative.turns += 1;
        return { ...cumulative };
      },
      async () => ({
        type: "shell_call_output",
        call_id: "call-1",
        output: [],
        status: "completed",
        max_output_length: null,
      }),
    );

    expect(reportedUsages).toEqual([
      { inputTokens: 6, cachedTokens: 4, outputTokens: 6 },
      { inputTokens: 6, cachedTokens: 4, outputTokens: 6 },
      { inputTokens: 8, cachedTokens: 0, outputTokens: 2 },
    ]);
    expect(cumulative).toEqual({ inputTokens: 20, cachedTokens: 8, outputTokens: 14, turns: 3 });
  });
  test("handleToolCalls can skip initial usage accounting on the first response", async () => {
    const stateCalls = [];
    const openai = {
      responses: {
        create: async () => ({ id: "resp-skip", output: [] }),
      },
    };
    const response = {
      id: "resp-skip",
      output: [],
      usage: { input_tokens: 9, input_tokens_details: { cached_tokens: 2 }, output_tokens: 4 },
    };

    await expect(
      handleToolCalls(
        openai,
        response,
        { model: "test-model", tools: [] },
        "/tmp/work",
        null,
        undefined,
        {
          skipInitialUsageAccounting: true,
          onResponseState: async (snapshot) => stateCalls.push(snapshot),
        },
      ),
    ).resolves.toBe(response);

    expect(stateCalls).toHaveLength(1);
    expect(stateCalls[0].cumulativeUsage).toBeNull();
  });
});
