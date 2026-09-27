import { describe, expect, jest, test } from "@jest/globals";
import { createLiveResponseHandlers } from "../src/agent-turn/response-events.mjs";

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

  test("routes text, shell, and custom-tool output while tracking visible text", () => {
    const status = { beginWriting: jest.fn() };
    const live = createLiveResponseHandlers({ liveStreaming: true, statusController: status });
    live.handlers.onTextDelta("answer");
    live.handlers.onEvent({ type: "response.function_call_arguments.delta", delta: "custom" });
    live.handlers.onEvent({ type: "response.shell_call_command.delta", delta: "shell" });
    live.handlers.onItemDone({ type: "function_call" });
    live.handlers.onItemDone({ type: "shell_call" });
    expect(live.sawOutput()).toBe(true);
    expect(live.streamedText()).toBe("answercustomshell\n\n");
    expect(stdoutWrites.join("")).toContain("answer");
    expect(status.beginWriting).toHaveBeenCalledTimes(1);
  });

  test("suppresses configured event categories without suppressing assistant text", () => {
    const live = createLiveResponseHandlers({
      liveStreaming: true,
      noReasoning: true,
      noShellCalls: true,
      noToolCalls: true,
      noMcpOutput: true,
      noWebsearch: true,
    });
    live.handlers.onTextDelta("answer");
    live.handlers.onEvent({ type: "response.reasoning_summary_text.delta", delta: "reasoning" });
    live.handlers.onEvent({ type: "response.shell_call_command.delta", delta: "shell" });
    live.handlers.onEvent({ type: "response.function_call_arguments.delta", delta: "tool" });
    live.handlers.onEvent({ type: "response.mcp_call_arguments.delta", delta: "mcp" });
    live.handlers.onEvent({ type: "response.web_search_call.searching" });
    live.handlers.onItemAdded({ type: "mcp_call", name: "lookup" });
    live.handlers.onItemDone({ type: "shell_call" });
    live.handlers.onItemDone({ type: "function_call" });
    live.handlers.onItemDone({ type: "mcp_call" });
    live.handlers.onItemDone({ type: "web_search_call" });
    live.handlers.onItemDone({
      type: "reasoning",
      summary: [{ type: "output_text", text: "hidden" }],
    });
    expect(stdoutWrites.join("")).toContain("answer");
    for (const hidden of ["reasoning", "shell", "tool", "mcp", "lookup", "web_search"])
      expect(stdoutWrites.join("")).not.toContain(hidden);
  });

  test("routes reasoning summaries and avoids duplicate reasoning transcripts", () => {
    const status = { pause: jest.fn(), resume: jest.fn() };
    const live = createLiveResponseHandlers({ liveStreaming: true, statusController: status });
    live.handlers.onEvent({ type: "response.reasoning_summary_text.delta", text: "summary" });
    live.handlers.onEvent({ type: "response.reasoning_summary_text.done" });
    live.handlers.onItemDone({
      type: "reasoning",
      summary: [{ type: "output_text", text: "fallback" }],
    });
    expect(stdoutWrites.join("")).toContain("summary");
    expect(stdoutWrites.join("")).not.toContain("fallback");
    expect(status.pause).toHaveBeenCalled();
    expect(status.resume).toHaveBeenCalledWith({ renderNow: false });
  });

  test("routes web-search state and completion through its renderer", () => {
    const status = {
      showExecuting: jest.fn(),
      pause: jest.fn(),
      showReasoning: jest.fn(),
      resume: jest.fn(),
    };
    const live = createLiveResponseHandlers({ liveStreaming: true, statusController: status });
    live.handlers.onEvent({ type: "response.web_search_call.in_progress" });
    live.handlers.onEvent({ type: "response.web_search_call.searching" });
    live.handlers.onItemDone({ type: "web_search_call", action: { queries: ["q"] } });
    expect(stdoutWrites.join("")).toContain('"web_search":"in_progress"');
    expect(stdoutWrites.join("")).toContain('"web_search":"searching"');
    expect(stdoutWrites.join("")).toContain('"web_search": "complete"');
    expect(status.showExecuting).toHaveBeenCalled();
    expect(status.showReasoning).toHaveBeenCalled();
    expect(status.resume).toHaveBeenCalled();
  });

  test("routes MCP progress, streamed arguments, and completed calls", () => {
    const status = {
      beginWriting: jest.fn(),
      showExecuting: jest.fn(),
      showReasoning: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
    };
    const live = createLiveResponseHandlers({ liveStreaming: true, statusController: status });
    live.handlers.onEvent({ type: "response.mcp_call.in_progress" });
    live.handlers.onEvent({ type: "response.mcp_call.progress", progress: "half" });
    live.handlers.onEvent({ type: "response.mcp_call.progress" });
    live.handlers.onEvent({ type: "response.mcp_call.completed" });
    live.handlers.onEvent({ type: "response.mcp_call.failed" });
    live.handlers.onEvent({ type: "response.mcp_call_arguments.delta", delta: '{"q":1}' });
    live.handlers.onItemAdded({ type: "mcp_call", name: "lookup" });
    live.handlers.onItemDone({ type: "mcp_call" });
    expect(stdoutWrites.join("")).toContain('{"mcp":"half"}');
    expect(stdoutWrites.join("")).toContain("lookup(");
    expect(status.showExecuting).toHaveBeenCalled();
    expect(status.showReasoning).toHaveBeenCalled();
    expect(status.pause).toHaveBeenCalled();
    expect(status.resume).toHaveBeenCalled();
    expect(status.showReasoning).toHaveBeenCalled();
  });

  test("uses a reasoning transcript when no streamed summary was received", () => {
    const live = createLiveResponseHandlers({ liveStreaming: true });
    live.handlers.onItemDone({
      type: "reasoning",
      summary: [{ type: "output_text", text: "transcript" }],
    });
    expect(stdoutWrites.join("")).toContain("transcript");
  });

  test("ignores web-search completion events until the completion item arrives", () => {
    const live = createLiveResponseHandlers({ liveStreaming: true });
    live.handlers.onEvent({ type: "response.web_search_call.completed" });
    live.handlers.onEvent({ type: "response.web_search_call.unknown" });
    expect(stdoutWrites).toEqual([]);
  });

  test("covers empty and alternate event fields without producing spurious output", () => {
    const live = createLiveResponseHandlers({ liveStreaming: true });
    live.handlers.onEvent({ type: "response.unknown" }, { raw: '{"type":"response.completed"}' });
    live.handlers.onEvent({
      type: "response.reasoning_summary_part.delta",
      summary_text: "summary",
    });
    live.handlers.onEvent({ type: "response.reasoning_summary_part.added" });
    live.handlers.onEvent({ type: "response.mcp_call.update" });
    live.handlers.onEvent({ type: "response.mcp_call.other" });
    live.handlers.onEvent({ type: "response.mcp_call_arguments.delta", delta: "" });
    live.handlers.onEvent({ type: "response.mcp_call_arguments.delta" });
    live.handlers.onEvent({ type: "response.function_call_arguments.delta", delta: "" });
    live.handlers.onEvent({ type: "response.function_call_arguments.delta" });
    live.handlers.onEvent({ type: "response.shell_call_command.delta", delta: "" });
    live.handlers.onEvent({ type: "response.shell_call_command.delta" });
    live.handlers.onTextDelta(undefined);
    live.handlers.onItemAdded({ type: "mcp_call", server_label: "server" });
    live.handlers.onItemAdded({ type: "mcp_call" });
    expect(live.sawOutput()).toBe(true);
    expect(stdoutWrites.join("")).toContain("server(");
    expect(stdoutWrites.join("")).toContain("mcp_call(");
    expect(stdoutWrites.join("")).not.toContain("response.completed");
  });

  test("ignores completion and unrelated events, and debug mode suppresses local summaries", () => {
    const status = { pause: jest.fn(), beginWriting: jest.fn() };
    const live = createLiveResponseHandlers({
      liveStreaming: true,
      statusController: status,
      debug: true,
    });
    live.handlers.onEvent({ type: "response.completed" });
    live.handlers.onEvent({ type: "response.test" });
    live.handlers.onEvent({ type: "response.reasoning_summary_text.delta", delta: "hidden" });
    live.handlers.onEvent({ type: "response.mcp_call_arguments.delta", delta: "hidden" });
    live.handlers.onItemDone({
      type: "reasoning",
      summary: [{ type: "output_text", text: "hidden" }],
    });
    expect(stdoutWrites.join("")).toBe("");
    expect(live.sawOutput()).toBe(false);
  });
});
