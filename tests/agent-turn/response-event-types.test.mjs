import { describe, expect, test } from "@jest/globals";
import {
  isFunctionCallArgumentsDeltaEvent,
  isMcpEvent,
  isMcpToolCall,
  isReasoningSummaryEvent,
  isResponseCompletedEvent,
  isShellCallCommandDeltaEvent,
  isShellToolCall,
  isWebSearchEvent,
} from "../../src/agent-turn/response-event-types.mjs";

describe("response event types", () => {
  test("classifies completion and tool deltas", () => {
    expect(isResponseCompletedEvent({ type: "response.completed" })).toBe(true);
    expect(isResponseCompletedEvent({}, '{"type":"response.completed"}')).toBe(true);
    expect(isResponseCompletedEvent({}, "other")).toBe(false);
    expect(
      isFunctionCallArgumentsDeltaEvent({ type: "response.function_call_arguments.delta" }),
    ).toBe(true);
    expect(isFunctionCallArgumentsDeltaEvent({})).toBe(false);
    expect(isShellCallCommandDeltaEvent({ type: "response.shell_call_command.delta" })).toBe(true);
    expect(isShellCallCommandDeltaEvent({})).toBe(false);
  });

  test("classifies web search, MCP, and reasoning events", () => {
    expect(isWebSearchEvent({ type: "response.web_search_call.started" })).toBe(true);
    expect(isWebSearchEvent({})).toBe(false);
    expect(isMcpEvent({ type: "response.mcp_call.started" })).toBe(true);
    expect(isMcpEvent({})).toBe(false);
    expect(isReasoningSummaryEvent({ type: "response.reasoning_summary_text.delta" })).toBe(true);
    expect(isReasoningSummaryEvent({})).toBe(false);
  });

  test("classifies shell and MCP response items", () => {
    expect(isShellToolCall({ type: "shell_call" })).toBe(true);
    expect(isShellToolCall({ type: "function_call" })).toBe(false);
    expect(isShellToolCall(null)).toBe(false);
    expect(isMcpToolCall({ type: "mcp_call" })).toBe(true);
    expect(isMcpToolCall({ type: "shell_call" })).toBe(false);
    expect(isMcpToolCall(undefined)).toBe(false);
  });
});
