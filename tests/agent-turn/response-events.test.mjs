import { describe, expect, jest, test } from "@jest/globals";
import { createLiveResponseHandlers } from "../../src/agent-turn/response-events.mjs";

describe("live response event routing", () => {
  test("returns no handlers when streaming is disabled", () => {
    expect(createLiveResponseHandlers({ liveStreaming: false }).handlers).toBeNull();
  });

  test("connects callbacks and tracks output across renderers", () => {
    const originalWrite = process.stdout.write;
    const writes = [];
    process.stdout.write = (chunk) => (writes.push(String(chunk)), true);
    const statusController = { beginWriting: jest.fn(), pause: jest.fn(), resume: jest.fn() };
    try {
      const live = createLiveResponseHandlers({ liveStreaming: true, statusController });
      live.handlers.onTextDelta("answer");
      live.handlers.onTextDelta(undefined);
      live.handlers.onEvent({ type: "response.reasoning_summary_text.delta", delta: "reasoning" });
      live.handlers.onEvent({ type: "response.function_call_arguments.delta", delta: "call" });
      live.handlers.onItemAdded({ type: "mcp_call", name: "lookup" });
      live.handlers.onItemDone({ type: "function_call" });
      live.flushTextDelta();
      expect(live.sawOutput()).toBe(true);
      expect(live.streamedText()).toContain("answer");
      expect(writes.join("").indexOf("answer")).toBeGreaterThanOrEqual(0);
      expect(statusController.beginWriting).toHaveBeenCalled();
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  test("does not add MCP items when MCP output is disabled", () => {
    const live = createLiveResponseHandlers({ liveStreaming: true, noMcpOutput: true });
    live.handlers.onItemAdded({ type: "mcp_call", name: "lookup" });
    expect(live.sawOutput()).toBe(false);
  });
});
