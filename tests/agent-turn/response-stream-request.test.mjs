import { describe, expect, jest, test } from "@jest/globals";
import {
  createResponseStreamContext,
  submitResponseStream,
} from "../../src/agent-turn/response-stream-request.mjs";

describe("response stream request", () => {
  test("uses supplied status context and stream options", async () => {
    const statusController = { showReasoning: jest.fn(), clear: jest.fn() };
    const context = createResponseStreamContext({
      sessionStartedAt: 12,
      statusController,
    });
    const request = { model: "test" };
    const openai = { responses: { create: jest.fn(async () => ({ id: "response" })) } };

    await expect(
      submitResponseStream(openai, request, context, {
        liveStreaming: true,
        debug: true,
        colors: false,
        noReasoning: true,
        noShellCalls: true,
        noToolCalls: true,
        noMcpOutput: true,
        noWebsearch: true,
      }),
    ).resolves.toEqual({ id: "response" });
    expect(openai.responses.create).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ onEvent: expect.any(Function) }),
    );
    expect(statusController.clear).toHaveBeenCalledTimes(1);
  });

  test("creates a quiet status context with default stream options", async () => {
    const context = createResponseStreamContext({ suppressStatusOutput: true, noTimers: true });
    const openai = { responses: { create: jest.fn(async () => ({ id: "default" })) } };
    await expect(submitResponseStream(openai, {}, context)).resolves.toEqual({ id: "default" });
    expect(context.sessionStartedAt).toEqual(expect.any(Number));
    expect(context.statusController).toBeDefined();
    expect(createResponseStreamContext().statusController).toBeDefined();
  });
});
