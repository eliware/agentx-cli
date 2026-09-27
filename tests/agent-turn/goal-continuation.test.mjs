import { describe, expect, jest, test } from "@jest/globals";
import { requestGoalContinuation } from "../../src/agent-turn/goal-continuation.mjs";

describe("goal continuation policy", () => {
  test("stops and clears status after reaching the iteration limit", async () => {
    const response = { id: "current", output: [] };
    const onGoalIteration = jest.fn();
    const onGoalLimit = jest.fn();
    const clear = jest.fn();
    const createResponse = jest.fn();

    await expect(
      requestGoalContinuation({
        openai: {},
        baseRequest: { model: "test-model" },
        currentResponse: response,
        goalText: "finish task",
        goalIterations: 2,
        goalMaxIterations: 2,
        onGoalIteration,
        onGoalLimit,
        statusController: { clear },
        createResponse,
      }),
    ).resolves.toEqual({ goalIterations: 3, response, limited: true });

    expect(onGoalIteration).toHaveBeenCalledWith(3);
    expect(onGoalLimit).toHaveBeenCalledWith(3);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(createResponse).not.toHaveBeenCalled();
  });

  test("constructs and submits a required goal-decision request", async () => {
    const openai = {};
    const response = { id: "current" };
    const nextResponse = { id: "next" };
    const createResponse = jest.fn().mockResolvedValue(nextResponse);
    const onGoalIteration = jest.fn();
    const statusController = {};

    await expect(
      requestGoalContinuation({
        openai,
        baseRequest: { model: "test-model", tools: ["tool"] },
        currentResponse: response,
        goalText: "finish task",
        goalIterations: 4,
        goalMaxIterations: 50,
        onGoalIteration,
        statusController,
        streamOptions: { debug: true, colors: false, noReasoning: true, noShellCalls: true },
        createResponse,
      }),
    ).resolves.toEqual({
      goalIterations: 5,
      response: nextResponse,
      previousResponseId: "current",
      limited: false,
    });

    expect(onGoalIteration).toHaveBeenCalledWith(5);
    expect(createResponse).toHaveBeenCalledWith(
      openai,
      {
        model: "test-model",
        tools: ["tool"],
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: expect.stringContaining("You are still working on this goal: finish task"),
              },
            ],
          },
        ],
        previous_response_id: "current",
        store: true,
        tool_choice: "required",
      },
      {
        liveStreaming: false,
        statusController,
        debug: true,
        colors: false,
        noReasoning: true,
        noShellCalls: true,
        noToolCalls: false,
        noMcpOutput: false,
        noWebsearch: false,
      },
    );
  });

  test("uses the default response stream and fallback goal text", async () => {
    const nextResponse = { id: "default-stream" };
    const openai = { responses: { create: jest.fn().mockResolvedValue(nextResponse) } };
    await expect(
      requestGoalContinuation({
        openai,
        baseRequest: {},
        currentResponse: {},
      }),
    ).resolves.toMatchObject({
      goalIterations: 1,
      response: nextResponse,
      previousResponseId: "",
      limited: false,
    });
    expect(openai.responses.create.mock.calls[0][0].input[0].content[0].text).toContain(
      "(goal text unavailable)",
    );
  });
});
