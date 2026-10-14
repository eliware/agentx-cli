import { describe, expect, jest, test } from "@jest/globals";
import { createLiveResponseHandlers } from "../../src/agent-turn/response-events.mjs";

describe("live response event routing", () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  test("returns no handlers when streaming is disabled", () => {
    expect(createLiveResponseHandlers({ liveStreaming: false }).handlers).toBeNull();
  });

  test("connects stream callbacks to each renderer and tracks visible output", () => {
    const statusController = {
      beginWriting: jest.fn(),
      showExecuting: jest.fn(),
      showReasoning: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
    };
    const live = createLiveResponseHandlers({ liveStreaming: true, statusController });
    live.handlers.onTextDelta("answer");
    live.handlers.onEvent({ type: "response.completed" });
    live.handlers.onEvent({ type: "response.test" });
    live.handlers.onEvent({ type: "response.reasoning_summary_text.delta", delta: "reasoning" });
    live.handlers.onEvent({
      type: "response.reasoning_summary_text.delta",
      text: "reasoning text",
    });
    live.handlers.onEvent({
      type: "response.reasoning_summary_part.delta",
      summary_text: "reasoning summary",
    });
    live.handlers.onEvent({ type: "response.reasoning_summary_text.done" });
    live.handlers.onEvent({ type: "response.reasoning_summary_part.added" });
    live.handlers.onEvent({ type: "response.web_search_call.in_progress" });
    live.handlers.onEvent({ type: "response.web_search_call.searching" });
    live.handlers.onEvent({ type: "response.web_search_call.completed" });
    live.handlers.onEvent({ type: "response.mcp_call.progress", progress: "half" });
    live.handlers.onEvent({ type: "response.mcp_call_arguments.delta", delta: "{}" });
    live.handlers.onEvent({ type: "response.function_call_arguments.delta", delta: "custom" });
    live.handlers.onEvent({ type: "response.function_call_arguments.delta", delta: "" });
    live.handlers.onEvent({ type: "response.function_call_arguments.delta" });
    live.handlers.onEvent({ type: "response.shell_call_command.delta", delta: "shell" });
    live.handlers.onEvent({ type: "response.shell_call_command.delta", delta: "" });
    live.handlers.onEvent({ type: "response.shell_call_command.delta" });
    live.handlers.onItemAdded({ type: "mcp_call", name: "lookup" });
    live.handlers.onItemDone({ type: "mcp_call", name: "lookup" });
    live.handlers.onItemDone({ type: "web_search_call", action: { queries: ["q"] } });
    live.handlers.onItemDone({ type: "function_call" });
    live.handlers.onItemDone({ type: "shell_call" });
    live.handlers.onItemDone({
      type: "reasoning",
      summary: [{ type: "output_text", text: "fallback" }],
    });
    live.handlers.onTextDelta(undefined);
    expect(live.sawOutput()).toBe(true);
    expect(live.streamedText()).toBe("answercustomshell\n\n\n");
    expect(stdoutWrites.join("")).toContain("answer");
    expect(statusController.beginWriting).toHaveBeenCalled();
  });

  test("keeps assistant text when category suppression is active", () => {
    const live = createLiveResponseHandlers({
      liveStreaming: true,
      noReasoning: true,
      noShellCalls: true,
      noToolCalls: true,
      noMcpOutput: true,
      noWebsearch: true,
    });
    live.handlers.onTextDelta("answer");
    live.handlers.onEvent({ type: "response.reasoning_summary_text.delta", delta: "hidden" });
    live.handlers.onEvent({ type: "response.shell_call_command.delta", delta: "hidden" });
    live.handlers.onEvent({ type: "response.function_call_arguments.delta", delta: "hidden" });
    live.handlers.onEvent({ type: "response.mcp_call_arguments.delta", delta: "hidden" });
    live.handlers.onEvent({ type: "response.web_search_call.searching" });
    live.handlers.onItemAdded({ type: "mcp_call", name: "lookup" });
    live.handlers.onItemDone({ type: "mcp_call" });
    live.handlers.onItemDone({ type: "web_search_call" });
    expect(live.streamedText()).toBe("answer");
  });

  test("passes debug policy to event and item callbacks", () => {
    const live = createLiveResponseHandlers({ liveStreaming: true, debug: true });
    live.handlers.onEvent({ type: "response.reasoning_summary_text.delta", delta: "hidden" });
    live.handlers.onEvent({ type: "response.mcp_call_arguments.delta", delta: "hidden" });
    live.handlers.onItemDone({
      type: "reasoning",
      summary: [{ type: "output_text", text: "hidden" }],
    });
    expect(live.streamedText()).toBe("");
    expect(stdoutWrites.join("")).toBe("");
  });

  test("renders a reasoning transcript when no summary arrived", () => {
    const live = createLiveResponseHandlers({ liveStreaming: true });
    live.handlers.onItemDone({
      type: "reasoning",
      summary: [{ type: "output_text", text: "transcript" }],
    });
    expect(stdoutWrites.join("")).toContain("transcript");
  });
});
