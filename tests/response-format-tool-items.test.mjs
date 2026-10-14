import { describe, expect, test } from "@jest/globals";
import { formatToolTranscript } from "../src/response-format-tool-items.mjs";

describe("response tool transcript", () => {
  test("formats calls and outputs", () => {
    expect(formatToolTranscript({ type: "function_call", name: "lookup", input: "x" })).toBe(
      "assistant tool call: lookup(x)",
    );
    expect(formatToolTranscript({ type: "shell_call", call_id: "id" })).toContain(
      "assistant shell call:",
    );
    expect(formatToolTranscript({ type: "function_call_output", output: "ok" })).toBe(
      "tool output: ok",
    );
    expect(formatToolTranscript({ type: "shell_call_output", output: [] })).toContain(
      "tool output shell_call_output:",
    );
    expect(formatToolTranscript({ type: "custom_call", value: 1 })).toBe(
      'assistant custom_call: {"type":"custom_call","value":1}',
    );
    expect(formatToolTranscript({ type: "custom_call_output" })).toContain("tool output");
    expect(formatToolTranscript({ type: "other" })).toBeUndefined();
    expect(formatToolTranscript({ type: "function_call", input: "fallback" })).toBe(
      "assistant tool call: function(fallback)",
    );
    expect(formatToolTranscript({ type: "function_call", name: "lookup", arguments: "" })).toBe(
      "assistant tool call: lookup()",
    );
    expect(formatToolTranscript({ type: "function_call_output", output: null })).toBe(
      "tool output: ",
    );
    expect(formatToolTranscript({ type: "custom_call_output", foo: "bar" })).toBe(
      'tool output custom_call_output: {"type":"custom_call_output","foo":"bar"}',
    );
    expect(formatToolTranscript({ type: "custom_call", foo: "bar" })).toBe(
      'assistant custom_call: {"type":"custom_call","foo":"bar"}',
    );
    expect(formatToolTranscript({})).toBeUndefined();
  });

  test("formats bounded shell previews", () => {
    const transcript = formatToolTranscript({
      type: "shell_call_output",
      call_id: "call-1",
      output: [{ stdout: "ready", stderr: "", outcome: { exit_code: 0 } }],
      status: "completed",
    });
    expect(transcript).toContain('"outcome":{"exit_code":0}');
    expect(transcript).toContain('"stdout":"ready"');
  });
});
