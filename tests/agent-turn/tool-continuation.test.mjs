import { describe, expect, jest, test } from "@jest/globals";
import { requestToolContinuation } from "../../src/agent-turn/tool-continuation.mjs";

describe("tool-result continuation requests", () => {
  test("submits ordinary tool outputs with the response predecessor and stream options", async () => {
    const openai = {};
    const currentResponse = { id: "current" };
    const response = { id: "next" };
    const statusController = {};
    const createResponse = jest.fn().mockResolvedValue(response);

    await expect(
      requestToolContinuation({
        openai,
        baseRequest: {
          model: "test-model",
          tools: ["shell"],
          text: { format: { type: "text" }, verbosity: "low" },
          reasoning: { effort: "medium", summary: null },
          context_management: [{ type: "compaction", compact_threshold: 300000 }],
        },
        currentResponse,
        outputs: [{ call_id: "tool-1", output: "done" }],
        streamOptions: {
          liveStreaming: true,
          debug: true,
          colors: false,
          noReasoning: true,
          noShellCalls: true,
          noToolCalls: true,
          noMcpOutput: true,
          noWebsearch: true,
        },
        statusController,
        createResponse,
      }),
    ).resolves.toEqual({
      request: {
        model: "test-model",
        tools: ["shell"],
        text: { format: { type: "text" }, verbosity: "low" },
        reasoning: { effort: "medium", summary: null },
        context_management: [{ type: "compaction", compact_threshold: 300000 }],
        input: [{ call_id: "tool-1", output: "done" }],
        previous_response_id: "current",
        store: true,
      },
      response,
      previousResponseId: "current",
    });
    expect(createResponse).toHaveBeenCalledWith(
      openai,
      expect.objectContaining({ previous_response_id: "current" }),
      {
        liveStreaming: true,
        statusController,
        debug: true,
        colors: false,
        noReasoning: true,
        noShellCalls: true,
        noToolCalls: true,
        noMcpOutput: true,
        noWebsearch: true,
      },
    );
  });

  test("requires the next goal tool decision and stops requiring tools after completion", async () => {
    const createResponse = jest.fn().mockResolvedValue({});
    const currentResponse = { id: "goal-response" };
    const base = {
      openai: {},
      baseRequest: { model: "test-model" },
      currentResponse,
      outputs: [{ call_id: "goal-call" }],
      createResponse,
    };
    await requestToolContinuation({ ...base, goalMode: true });
    expect(createResponse.mock.calls[0][1]).toMatchObject({
      tool_choice: "required",
      input: [
        { call_id: "goal-call" },
        {
          role: "user",
          content: [{ type: "input_text", text: expect.stringContaining("Do not repeat") }],
        },
      ],
    });

    await requestToolContinuation({ ...base, goalMode: true, goalFinished: true });
    expect(createResponse.mock.calls[1][1]).toMatchObject({
      tool_choice: "none",
      input: [{ call_id: "goal-call" }],
    });
  });

  test("uses default stream settings and reports failed continuation state before rethrowing", async () => {
    const error = new Error("stream failed");
    const currentResponse = { id: "retry-parent" };
    const onRetryState = jest.fn();
    const createResponse = jest.fn().mockRejectedValue(error);
    await expect(
      requestToolContinuation({
        openai: {},
        baseRequest: {},
        currentResponse,
        outputs: [],
        onRetryState,
        createResponse,
      }),
    ).rejects.toBe(error);
    expect(createResponse).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ previous_response_id: "retry-parent" }),
      {
        liveStreaming: false,
        statusController: undefined,
        debug: false,
        colors: true,
        noReasoning: false,
        noShellCalls: false,
        noToolCalls: false,
        noMcpOutput: false,
        noWebsearch: false,
      },
    );
    expect(onRetryState).toHaveBeenCalledWith({
      request: expect.objectContaining({ previous_response_id: "retry-parent" }),
      response: currentResponse,
    });
  });
});
