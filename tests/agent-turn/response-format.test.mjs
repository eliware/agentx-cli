import { describe, expect, test } from "@jest/globals";
import {
  isMcpToolCall,
  isShellToolCall,
  responseItemToTranscript,
} from "../../src/agent-turn/response-format.mjs";

describe("agent response transcript formatting", () => {
  test("formats message text, refusals, roles, and empty content", () => {
    expect(
      responseItemToTranscript({
        role: "assistant",
        type: "message",
        content: [
          { type: "input_text", text: "line one" },
          { type: "output_text", text: "line two" },
          { type: "refusal", refusal: "nope" },
        ],
      }),
    ).toBe("assistant: line one\nline two\n[refusal] nope");
    expect(
      responseItemToTranscript({
        type: "message",
        content: [
          { type: "input_text" },
          { type: "output_text" },
          { type: "refusal", refusal: "" },
          { text: "gamma" },
        ],
      }),
    ).toBe("message: gamma");
    expect(responseItemToTranscript({ type: "message", content: undefined })).toBe("");
    expect(responseItemToTranscript({ type: "message", content: [] })).toBe("");
    expect(
      responseItemToTranscript({
        role: "developer",
        type: "message",
        content: [{ type: "input_text", text: "private" }],
      }),
    ).toBe("");
    expect(
      responseItemToTranscript({
        role: "user",
        type: "message",
        content: [{ type: "input_text", text: "hello" }],
      }),
    ).toBe("user: hello");
  });

  test("formats function and shell calls with sensible defaults", () => {
    expect(
      responseItemToTranscript({ type: "function_call", name: "lookup", arguments: '{"x":1}' }),
    ).toBe('assistant tool call: lookup({"x":1})');
    expect(responseItemToTranscript({ type: "function_call", name: "lookup", input: "abc" })).toBe(
      "assistant tool call: lookup(abc)",
    );
    expect(responseItemToTranscript({ type: "function_call", name: "lookup" })).toBe(
      "assistant tool call: lookup()",
    );
    expect(responseItemToTranscript({ type: "function_call", input: "payload" })).toBe(
      "assistant tool call: function(payload)",
    );
    expect(
      responseItemToTranscript({
        type: "shell_call",
        call_id: "call-99",
        action: { commands: ["echo hi"] },
        status: "completed",
      }),
    ).toBe(
      'assistant shell call: {"call_id":"call-99","action":{"commands":["echo hi"]},"status":"completed"}',
    );
  });

  test("formats tool outputs, reasoning, and unknown response items", () => {
    expect(responseItemToTranscript({ type: "function_call_output", output: "ok" })).toBe(
      "tool output: ok",
    );
    expect(responseItemToTranscript({ type: "function_call_output", output: null })).toBe(
      "tool output: ",
    );
    expect(responseItemToTranscript({ type: "reasoning", summary: [] })).toBe("");
    expect(responseItemToTranscript({ type: "reasoning" })).toBe("");
    expect(
      responseItemToTranscript({
        type: "reasoning",
        summary: [{ type: "output_text", text: "plan" }],
      }),
    ).toBe("plan");
    expect(responseItemToTranscript({ type: "custom_call", foo: "bar" })).toBe(
      'assistant custom_call: {"type":"custom_call","foo":"bar"}',
    );
    expect(responseItemToTranscript({ type: "custom_call_output", foo: "bar" })).toBe(
      'tool output custom_call_output: {"type":"custom_call_output","foo":"bar"}',
    );
    expect(
      responseItemToTranscript({
        type: "custom_call_output",
        call_id: "call-3",
        output: [1, { stdout: "ok", stderr: "", outcome: null }],
      }),
    ).toBe(
      'tool output custom_call_output: {"type":"custom_call_output","call_id":"call-3","output":[1,{"stdout":"ok","stderr":"","outcome":null}]}',
    );
    expect(responseItemToTranscript({ role: "assistant" })).toBe('assistant: {"role":"assistant"}');
    expect(responseItemToTranscript({ type: "note", message: "fallback" })).toBe(
      'note: {"type":"note","message":"fallback"}',
    );
    expect(responseItemToTranscript({})).toBe("item: {}");
  });

  test("bounds shell previews and omits encrypted or oversized content", () => {
    const transcript = responseItemToTranscript({
      type: "shell_call_output",
      call_id: "call-1",
      output: [
        {
          stdout: "x".repeat(200),
          stderr: "y".repeat(200),
          outcome: { type: "exit", exit_code: 0 },
        },
        "ignored",
      ],
      max_output_length: 10,
      status: "completed",
    });
    expect(transcript).toContain("tool output shell_call_output:");
    expect(transcript).toContain("x".repeat(120));
    expect(transcript).not.toContain("x".repeat(121));
    expect(
      responseItemToTranscript({
        type: "custom_call_output",
        output: [{}],
        encrypted_content: "secret",
        result: "x".repeat(501),
      }),
    ).toContain("[encrypted reasoning omitted]");
    expect(
      responseItemToTranscript({
        type: "custom_call_output",
        output: [{}],
        encrypted_content: "secret",
        result: "x".repeat(501),
      }),
    ).toContain("[large result omitted: 501 chars]");
    expect(responseItemToTranscript({ type: "shell_call_output", call_id: "call-5" })).toBe(
      'tool output shell_call_output: {"call_id":"call-5","output":[]}',
    );
  });

  test("classifies shell and MCP calls without formatting response contents", () => {
    expect(isShellToolCall({ type: "shell_call" })).toBe(true);
    expect(isShellToolCall({ type: "function_call" })).toBe(false);
    expect(isShellToolCall(null)).toBe(false);
    expect(isMcpToolCall({ type: "mcp_call" })).toBe(true);
    expect(isMcpToolCall({ type: "shell_call" })).toBe(false);
    expect(isMcpToolCall(undefined)).toBe(false);
  });
});
