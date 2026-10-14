import { describe, expect, test, jest } from "@jest/globals";
import { createResponseEventHandler } from "../../src/agent-turn/response-event-handler.mjs";

function setup(options = {}) {
  const markOutput = jest.fn();
  const appendStreamedText = jest.fn();
  const reasoningRenderer = { writeDelta: jest.fn(), finish: jest.fn() };
  const webSearchRenderer = { start: jest.fn(), searching: jest.fn() };
  const mcpRenderer = { writeArguments: jest.fn(), handleEvent: jest.fn() };
  const toolEventRenderer = { writeDelta: jest.fn(() => "tool") };
  const onEvent = createResponseEventHandler({
    noReasoning: false,
    noShellCalls: false,
    noToolCalls: false,
    noMcpOutput: false,
    noWebsearch: false,
    debug: false,
    markOutput,
    appendStreamedText,
    reasoningRenderer,
    webSearchRenderer,
    mcpRenderer,
    toolEventRenderer,
    ...options,
  });
  return {
    onEvent,
    markOutput,
    appendStreamedText,
    reasoningRenderer,
    webSearchRenderer,
    mcpRenderer,
  };
}

describe("response event handler", () => {
  test("handles reasoning, web search, and MCP events", () => {
    const state = setup();
    state.onEvent({ type: "response.reasoning_summary_text.delta", delta: "think" });
    state.onEvent({ type: "response.reasoning_summary_text.delta", text: "fallback" });
    state.onEvent({ type: "response.reasoning_summary_part.delta", summary_text: "summary" });
    state.onEvent({ type: "response.reasoning_summary_text.done" });
    state.onEvent({ type: "response.reasoning_summary_part.added" });
    state.onEvent({ type: "response.web_search_call.searching" });
    state.onEvent({ type: "response.web_search_call.in_progress" });
    state.onEvent({ type: "response.web_search_call.completed" });
    state.onEvent({ type: "response.mcp_call_arguments.delta" });
    state.onEvent({ type: "response.mcp_call.progress" });
    state.onEvent({ type: "response.other" });
    expect(state.reasoningRenderer.writeDelta).toHaveBeenCalledWith("think");
    expect(state.reasoningRenderer.writeDelta).toHaveBeenCalledWith("fallback");
    expect(state.reasoningRenderer.writeDelta).toHaveBeenCalledWith("summary");
    expect(state.reasoningRenderer.finish).toHaveBeenCalled();
    expect(state.webSearchRenderer.start).toHaveBeenCalled();
    expect(state.webSearchRenderer.searching).toHaveBeenCalled();
    expect(state.mcpRenderer.writeArguments).toHaveBeenCalled();
    expect(state.mcpRenderer.handleEvent).toHaveBeenCalled();
  });

  test("ignores completion events without changing renderer state", () => {
    const state = setup();
    state.onEvent({ type: "response.completed" });
    expect(state.reasoningRenderer.writeDelta).not.toHaveBeenCalled();
    expect(state.webSearchRenderer.start).not.toHaveBeenCalled();
    expect(state.mcpRenderer.handleEvent).not.toHaveBeenCalled();
    expect(state.markOutput).not.toHaveBeenCalled();
  });

  test("streams tool deltas and honors suppression flags", () => {
    const state = setup();
    state.onEvent({ type: "response.function_call_arguments.delta", delta: "x" });
    state.onEvent({ type: "response.function_call_arguments.delta", delta: "" });
    state.onEvent({ type: "response.shell_call_command.delta", delta: "x" });
    state.onEvent({ type: "response.shell_call_command.delta" });
    expect(state.appendStreamedText).toHaveBeenCalledWith("tool");
    expect(state.appendStreamedText).toHaveBeenCalledTimes(2);
    const hidden = setup({ noToolCalls: true });
    hidden.onEvent({ type: "response.function_call_arguments.delta", delta: "x" });
    expect(hidden.markOutput).not.toHaveBeenCalled();
  });

  test.each([
    [
      "noReasoning",
      { type: "response.reasoning_summary_text.delta", delta: "x" },
      "reasoningRenderer",
      "writeDelta",
    ],
    ["noMcpOutput", { type: "response.mcp_call_arguments.delta" }, "mcpRenderer", "writeArguments"],
    [
      "noWebsearch",
      { type: "response.web_search_call.searching" },
      "webSearchRenderer",
      "searching",
    ],
  ])("suppresses %s at the event handler boundary", (flag, event, renderer, method) => {
    const state = setup({ [flag]: true });
    state.onEvent(event);
    expect(state[renderer][method]).not.toHaveBeenCalled();
  });

  test.each([
    ["noShellCalls", { type: "response.shell_call_command.delta", delta: "x" }],
    ["noToolCalls", { type: "response.function_call_arguments.delta", delta: "x" }],
  ])("suppresses %s tool deltas", (flag, event) => {
    const state = setup({ [flag]: true });
    state.onEvent(event);
    expect(state.markOutput).not.toHaveBeenCalled();
  });

  test("suppresses debug and MCP event output", () => {
    const debug = setup({ debug: true });
    debug.onEvent({ type: "response.mcp_call_arguments.delta" });
    expect(debug.mcpRenderer.writeArguments).not.toHaveBeenCalled();
    const hidden = setup({ noMcpOutput: true });
    hidden.onEvent({ type: "response.mcp_call.progress" });
    expect(hidden.mcpRenderer.handleEvent).not.toHaveBeenCalled();
  });
});
