import { describe, expect, test, jest } from "@jest/globals";
import { createResponseItemDoneHandler } from "../../src/agent-turn/response-item-done.mjs";

function setup(overrides = {}) {
  const appendStreamedText = jest.fn();
  const markOutput = jest.fn();
  const webSearchRenderer = { finish: jest.fn() };
  const reasoningRenderer = { hasStreamedSummary: jest.fn(() => true) };
  const mcpRenderer = { finishCall: jest.fn(() => "mcp") };
  const toolEventRenderer = { finishItem: jest.fn(() => "tool") };
  const onItemDone = createResponseItemDoneHandler({
    noReasoning: false,
    noShellCalls: false,
    noToolCalls: false,
    noMcpOutput: false,
    noWebsearch: false,
    debug: false,
    webSearchRenderer,
    reasoningRenderer,
    mcpRenderer,
    toolEventRenderer,
    markOutput,
    appendStreamedText,
    ...overrides,
  });
  return { onItemDone, appendStreamedText, markOutput, webSearchRenderer, reasoningRenderer };
}

describe("response item completion", () => {
  test("finishes web search and tool items", () => {
    const state = setup();
    state.onItemDone({ type: "web_search_call" });
    state.onItemDone({ type: "function_call", name: "custom" });
    expect(state.webSearchRenderer.finish).toHaveBeenCalled();
    expect(state.markOutput).toHaveBeenCalled();
    expect(state.appendStreamedText).toHaveBeenCalledWith("tool");
  });

  test("respects output flags and suppresses streamed reasoning", () => {
    const state = setup({ noWebsearch: true });
    state.onItemDone({ type: "web_search_call" });
    expect(state.webSearchRenderer.finish).not.toHaveBeenCalled();
    state.onItemDone({ type: "reasoning", summary: [{ text: "thinking" }] });
    expect(state.reasoningRenderer.hasStreamedSummary).toHaveBeenCalled();
  });
});
