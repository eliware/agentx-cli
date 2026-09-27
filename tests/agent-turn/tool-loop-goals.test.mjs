import { afterEach, beforeEach, describe, expect, jest as testMocks, test } from "@jest/globals";
import { handleToolCalls } from "../../src/agent-turn/tool-loop.mjs";

describe("tool-loop goal orchestration", () => {
  let originalStdoutWrite;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    process.stdout.write = () => true;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  test("does not dispatch goal tools outside goal mode", async () => {
    const response = {
      id: "response",
      output: [
        {
          type: "function_call",
          name: "goal_update",
          call_id: "goal-1",
          arguments: JSON.stringify({ method: "complete" }),
        },
      ],
    };
    const openai = { responses: { create: testMocks.fn() } };

    await expect(
      handleToolCalls(openai, response, { model: "test-model", tools: [] }, "."),
    ).resolves.toBe(response);
    expect(openai.responses.create).not.toHaveBeenCalled();
  });

  test("requests required goal decisions while preserving live streaming", async () => {
    const openai = {
      responses: { create: testMocks.fn().mockResolvedValue({ id: "next", output: [] }) },
    };
    const statusController = { showReasoning: testMocks.fn(), clear: testMocks.fn() };

    await handleToolCalls(
      openai,
      { id: "current", output: [] },
      { model: "test-model", tools: [] },
      ".",
      null,
      undefined,
      {
        goalMode: true,
        liveStreaming: true,
        goalText: "finish the task",
        goalMaxIterations: 1,
        statusController,
      },
    );

    expect(openai.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({ previous_response_id: "current", tool_choice: "required" }),
      expect.any(Object),
    );
    expect(statusController.showReasoning).toHaveBeenCalledTimes(1);
  });

  test("continues goal mode when a response omits its response ID", async () => {
    const openai = {
      responses: {
        create: testMocks
          .fn()
          .mockResolvedValueOnce({ output: [] })
          .mockResolvedValueOnce({
            id: "goal-complete",
            output: [
              {
                type: "function_call",
                name: "goal_update",
                call_id: "goal-1",
                arguments: JSON.stringify({ method: "complete", summary: "done" }),
              },
            ],
          })
          .mockResolvedValueOnce({ output: [] }),
      },
    };
    const response = {
      output: [
        {
          type: "function_call",
          name: "goal_update",
          call_id: "goal-0",
          arguments: JSON.stringify({ method: "incomplete" }),
        },
      ],
    };

    await expect(
      handleToolCalls(openai, response, { model: "test-model", tools: [] }, ".", null, undefined, {
        goalMode: true,
        goalText: "test goal",
      }),
    ).resolves.toEqual({ output: [] });
  });

  test("handles goal questions and blocked outcomes through the loop", async () => {
    const makeOpenai = (method) => ({
      responses: {
        create: testMocks
          .fn()
          .mockResolvedValueOnce({
            id: `${method}-next`,
            output: [
              {
                type: "function_call",
                name: "goal_update",
                call_id: `${method}-complete`,
                arguments: JSON.stringify({ method: "complete" }),
              },
            ],
          })
          .mockResolvedValueOnce({ id: `${method}-final`, output: [] }),
      },
    });
    const questionOpenai = makeOpenai("question");
    const question = {
      output: [
        {
          type: "function_call",
          name: "goal_update",
          call_id: "question-1",
          arguments: JSON.stringify({ method: "question", question: "Continue?" }),
        },
      ],
    };
    await expect(
      handleToolCalls(
        questionOpenai,
        question,
        { model: "test-model", tools: [] },
        ".",
        null,
        undefined,
        { goalMode: true, onGoalBlocked: async () => "yes" },
      ),
    ).resolves.toEqual({ id: "question-final", output: [] });

    const blockedOpenai = makeOpenai("blocked");
    const blocked = {
      output: [
        {
          type: "function_call",
          name: "goal_update",
          call_id: "blocked-1",
          arguments: JSON.stringify({ method: "blocked" }),
        },
      ],
    };
    await expect(
      handleToolCalls(
        blockedOpenai,
        blocked,
        { model: "test-model", tools: [] },
        ".",
        null,
        undefined,
        { goalMode: true, onGoalLimit: testMocks.fn(), goalIterations: 2 },
      ),
    ).resolves.toEqual({
      id: "blocked-next",
      output: [
        {
          type: "function_call",
          name: "goal_update",
          call_id: "blocked-complete",
          arguments: JSON.stringify({ method: "complete" }),
        },
      ],
    });
  });

  test("resumes after a goal-blocked question and sends the answer as tool output", async () => {
    const openai = {
      responses: { create: testMocks.fn().mockResolvedValue({ id: "blocked-next", output: [] }) },
    };
    const response = {
      id: "blocked",
      output: [
        {
          type: "function_call",
          name: "goal_blocked",
          call_id: "blocked-1",
          arguments: JSON.stringify({ question: "Continue?" }),
        },
      ],
    };
    const statusController = {
      pause: testMocks.fn(),
      resume: testMocks.fn(),
      clear: testMocks.fn(),
      showExecuting: testMocks.fn(),
      updateExecuting: testMocks.fn(),
      snapshot: testMocks.fn(() => null),
    };

    await expect(
      handleToolCalls(openai, response, { model: "test-model", tools: [] }, ".", null, undefined, {
        goalMode: true,
        onGoalBlocked: async () => "",
        statusController,
      }),
    ).resolves.toEqual({ id: "blocked-next", output: [] });
    expect(statusController.pause).toHaveBeenCalled();
    expect(statusController.resume).toHaveBeenCalledWith({ renderNow: false });
    expect(openai.responses.create.mock.calls[0][0].input[0].output).toBe(
      "Continue without user input.",
    );
  });

  test("returns the goal response after a cancellation check", async () => {
    const clear = testMocks.fn();
    const response = { output: [] };
    await expect(
      handleToolCalls(
        { responses: { create: testMocks.fn() } },
        response,
        { model: "test-model", tools: [] },
        ".",
        null,
        undefined,
        { goalMode: true, isGoalCancelled: () => true, statusController: { clear } },
      ),
    ).resolves.toBe(response);
    expect(clear).toHaveBeenCalled();
  });

  test("finalizes a completed goal and reports its final usage", async () => {
    const openai = {
      responses: {
        create: testMocks.fn().mockResolvedValue({
          id: "goal-final",
          output: [],
          usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 1 }, output_tokens: 3 },
        }),
      },
    };
    const response = {
      id: "goal",
      output: [
        {
          type: "function_call",
          name: "goal_update",
          call_id: "goal-1",
          arguments: JSON.stringify({ method: "complete" }),
        },
      ],
    };
    const statusController = {
      pause: testMocks.fn(),
      clear: testMocks.fn(),
      showExecuting: testMocks.fn(),
      updateExecuting: testMocks.fn(),
      snapshot: testMocks.fn(() => null),
    };
    const usage = [];

    await expect(
      handleToolCalls(
        openai,
        response,
        { model: "test-model", tools: [] },
        ".",
        (value) => {
          usage.push(value);
          return { inputTokens: 2, cachedTokens: 1, outputTokens: 3, turns: 1 };
        },
        undefined,
        { goalMode: true, statusController },
      ),
    ).resolves.toEqual({ id: "goal-final", output: [], usage: expect.any(Object) });
    expect(usage).toHaveLength(2);
  });

  test("processes image-generation results before unavailable image inspection", async () => {
    const imageGeneration = testMocks.fn();
    const openai = {
      responses: { create: testMocks.fn().mockResolvedValue({ id: "image-next", output: [] }) },
    };
    const response = {
      output: [
        { type: "image_generation_call", result: "data", call_id: "generation-1" },
        { type: "function_call", name: "view_image", call_id: "image-1", arguments: "{}" },
      ],
    };

    await handleToolCalls(
      openai,
      response,
      { model: "test-model", tools: [] },
      ".",
      null,
      undefined,
      { onImageGeneration: imageGeneration },
    );
    expect(imageGeneration).toHaveBeenCalled();
    expect(openai.responses.create.mock.calls[0][0].input[0].output).toBe(
      "ERROR: image inspection is unavailable",
    );
  });

  test("returns the current response when cancellation arrives during goal execution", async () => {
    const clear = testMocks.fn();
    const response = {
      output: [{ type: "shell_call", call_id: "shell-1", action: { commands: ["echo hi"] } }],
    };
    let checks = 0;

    await expect(
      handleToolCalls(
        { responses: { create: testMocks.fn() } },
        response,
        { model: "test-model", tools: [] },
        ".",
        null,
        async () => ({}),
        {
          goalMode: true,
          isGoalCancelled: () => checks++ > 0,
          statusController: { clear, showExecuting: testMocks.fn() },
        },
      ),
    ).resolves.toBe(response);
    expect(clear).toHaveBeenCalled();
  });

  test("suppresses usage output during a quiet goal completion", async () => {
    const openai = {
      responses: {
        create: testMocks.fn().mockResolvedValue({
          id: "quiet-final",
          output: [],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    };
    const response = {
      output: [
        {
          type: "function_call",
          name: "goal_update",
          call_id: "quiet-1",
          arguments: JSON.stringify({ method: "complete" }),
        },
      ],
    };

    await expect(
      handleToolCalls(openai, response, { model: "test-model", tools: [] }, ".", null, undefined, {
        goalMode: true,
        suppressUsageOutput: true,
        noTimers: true,
      }),
    ).resolves.toMatchObject({ id: "quiet-final" });
  });
});
