import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { finalizeToolLoopResponse } from "../../src/agent-turn/tool-loop-completion.mjs";

describe("tool-loop response completion", () => {
  let originalWrite;
  let writes;

  afterEach(() => {
    if (originalWrite) process.stdout.write = originalWrite;
  });

  test("uses a supplied snapshot, clears status, and suppresses the completion line", async () => {
    const response = { id: "final" };
    const snapshot = { time: "1s", reasoning: "0s/0s", writing: "0s/0s", executing: "0s/0s" };
    const statusController = { snapshot: jest.fn(), clear: jest.fn() };
    await expect(
      finalizeToolLoopResponse({
        response,
        completionSnapshot: snapshot,
        statusController,
        sessionStartedAt: Date.now(),
        streamOptions: { suppressStatusOutput: true },
      }),
    ).resolves.toBe(response);
    expect(statusController.snapshot).not.toHaveBeenCalled();
    expect(statusController.clear).toHaveBeenCalledTimes(1);
  });

  test("reports final usage and persists the final response before rendering completion", async () => {
    originalWrite = process.stdout.write;
    writes = [];
    process.stdout.write = (text) => {
      writes.push(String(text));
      return true;
    };
    const response = {
      id: "goal-final",
      usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 3 }, output_tokens: 4 },
    };
    const statusController = {
      snapshot: jest.fn(() => ({
        time: "2s",
        reasoning: "1s/2s",
        writing: "1s/2s",
        executing: "0s/0s",
      })),
      clear: jest.fn(),
    };
    const cumulativeUsage = { inputTokens: 7, cachedTokens: 3, outputTokens: 4, turns: 1 };
    const onResponseUsage = jest.fn(() => cumulativeUsage);
    const onResponseState = jest.fn();
    await finalizeToolLoopResponse({
      response,
      statusController,
      sessionStartedAt: Date.now(),
      baseRequest: { model: "gpt-6-luna" },
      onResponseUsage,
      onResponseState,
      reportFinalUsage: true,
    });
    expect(onResponseUsage).toHaveBeenCalledWith({
      inputTokens: 7,
      cachedTokens: 3,
      outputTokens: 4,
    });
    expect(onResponseState).toHaveBeenCalledWith({
      response,
      pendingToolCalls: [],
      isInitialResponse: false,
      cumulativeUsage,
    });
    expect(statusController.clear).toHaveBeenCalledTimes(1);
    expect(writes.join("")).toContain('"time":"2s"');
  });

  test("respects no-timer output suppression and tolerates absent status controls", async () => {
    originalWrite = process.stdout.write;
    writes = [];
    process.stdout.write = (text) => {
      writes.push(String(text));
      return true;
    };
    const response = { id: "quiet-final" };
    await finalizeToolLoopResponse({
      response,
      sessionStartedAt: Date.now(),
      streamOptions: { noTimers: true },
    });
    expect(writes).toEqual([]);
    await finalizeToolLoopResponse({
      response,
      sessionStartedAt: Date.now(),
      streamOptions: { suppressStatusOutput: true, suppressUsageOutput: true },
      reportFinalUsage: true,
    });
    expect(writes).toEqual([]);
  });
});
