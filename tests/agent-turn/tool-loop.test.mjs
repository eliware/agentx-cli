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
