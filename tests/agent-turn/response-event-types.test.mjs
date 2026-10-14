import { describe, expect, test } from "@jest/globals";
import {
  isFunctionCallArgumentsDeltaEvent,
  isMcpEvent,
  isReasoningSummaryEvent,
  isResponseCompletedEvent,
  isShellCallCommandDeltaEvent,
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
});
