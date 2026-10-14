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

  test("flushes completed worker usage callbacks inline", async () => {
    const openai = { responses: { create: async () => ({ id: "resp-next", output: [] }) } };
    const response = {
      id: "resp-1",
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [
        {
          type: "function_call",
          name: "agent_status",
          call_id: "worker-status",
          arguments: JSON.stringify({ agent_ids: ["missing-agent"] }),
        },
      ],
    };
    const onWorkerComplete = testMocks.fn();
    const runToolCallFn = testMocks.fn(async (_call, _cwd, options) => {
      options.onWorkerComplete({
        usage: { turns: 1, inputTokens: 2, cachedTokens: 0, outputTokens: 3 },
      });
      options.onWorkerComplete(null);
      return { agents: [{ id: "missing-agent", status: "unknown" }] };
    });
    await handleToolCalls(
      openai,
      response,
      { model: "test-model", tools: [] },
      "/tmp/work",
      null,
      runToolCallFn,
      { onWorkerComplete },
    );
    expect(onWorkerComplete).toHaveBeenCalledTimes(1);
    const delayedStatus = {
      isWriting: () => true,
      pause: testMocks.fn(),
      resume: testMocks.fn(),
      clear: testMocks.fn(),
      showExecuting: testMocks.fn(),
      updateExecuting: testMocks.fn(),
    };
    await handleToolCalls(
      openai,
      response,
      { model: "test-model", tools: [] },
      "/tmp/work",
      null,
      runToolCallFn,
      { onWorkerComplete, statusController: delayedStatus },
    );
    expect(onWorkerComplete).toHaveBeenCalledTimes(2);
  });
  test("handleToolCalls dispatches worker function calls", async () => {
    const openai = { responses: { create: async () => ({ id: "resp-next", output: [] }) } };
    const response = {
      id: "resp-1",
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [
        {
          type: "function_call",
          name: "agent_status",
          call_id: "worker-status",
          arguments: JSON.stringify({ agent_ids: ["missing-agent"] }),
        },
      ],
    };
    const runToolCallFn = testMocks.fn(async () => ({
      agents: [{ id: "missing-agent", status: "unknown" }],
      waited: false,
      timed_out: false,
    }));
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
    expect(runToolCallFn).toHaveBeenCalledTimes(1);
  });
});
