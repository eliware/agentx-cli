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
    state.onEvent({ type: "response.web_search_call.searching" });
    state.onEvent({ type: "response.mcp_call_arguments.delta" });
    expect(state.reasoningRenderer.writeDelta).toHaveBeenCalledWith("think");
    expect(state.webSearchRenderer.searching).toHaveBeenCalled();
    expect(state.mcpRenderer.writeArguments).toHaveBeenCalled();
  });

  test("streams tool deltas and honors suppression flags", () => {
    const state = setup();
    state.onEvent({ type: "response.function_call_arguments.delta", delta: "x" });
    expect(state.appendStreamedText).toHaveBeenCalledWith("tool");
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
});
