import { describe, expect, test } from "@jest/globals";
import { createPendingResponse, getToolCallId } from "../../src/agent/pending-response.mjs";

describe("pending response adapter", () => {
  test("converts saved pending calls into a Responses continuation", () => {
    const calls = [{ type: "shell_call", call_id: "call-1" }];
    expect(createPendingResponse({ response_id: "response-1", pending_tool_calls: calls })).toEqual(
      {
        id: "response-1",
        output: calls,
      },
    );
    expect(
      createPendingResponse({ response_id: undefined, pending_tool_calls: "invalid" }),
    ).toEqual({
      id: "",
      output: [],
    });
    expect(createPendingResponse(null)).toEqual({ id: "", output: [] });
  });

  test("extracts normalized tool-call IDs for recovery bookkeeping", () => {
    expect(getToolCallId({ call_id: " call-1 " })).toBe("call-1");
    expect(getToolCallId({ id: "call-2" })).toBe("call-2");
    expect(getToolCallId({ call_id: "", id: " call-2 " })).toBe("call-2");
    expect(getToolCallId({})).toBe("");
    expect(getToolCallId(null)).toBe("");
  });
});
