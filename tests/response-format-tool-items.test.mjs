import { describe, expect, test } from "@jest/globals";
import { compactTranscriptJson, formatToolTranscript } from "../src/response-format-tool-items.mjs";

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

  test("bounds sensitive and large result fields", () => {
    const result = compactTranscriptJson({
      encrypted_content: "secret",
      result: "x".repeat(501),
      output: [{ stdout: "x".repeat(150), stderr: "y".repeat(150) }, null, "plain", {}],
    });
    expect(result).toContain("[encrypted reasoning omitted]");
    expect(result).toContain("[large result omitted: 501 chars]");
    expect(result).toContain("x".repeat(120));
    expect(result).not.toContain("x".repeat(121));
    expect(result).toContain('null,"plain",{"stdout":"","stderr":""}');
    expect(compactTranscriptJson({ result: "small", output: "plain" })).toBe(
      '{"result":"small","output":"plain"}',
    );
  });

  test("bounds shell previews and keeps outcome details", () => {
    const transcript = formatToolTranscript({
      type: "shell_call_output",
      call_id: "call-1",
      output: [
        { stdout: "x".repeat(200), stderr: "y".repeat(200), outcome: { exit_code: 0 } },
        "ignored",
        null,
      ],
      max_output_length: 10,
      status: "completed",
    });
    expect(transcript).toContain("x".repeat(120));
    expect(transcript).not.toContain("x".repeat(121));
    expect(transcript).toContain('"outcome":{"exit_code":0}');
    expect(formatToolTranscript({ type: "shell_call_output", call_id: "call-5" })).toBe(
      'tool output shell_call_output: {"call_id":"call-5","output":[]}',
    );
    expect(
      formatToolTranscript({ type: "shell_call", call_id: "call-2", action: { commands: ["ls"] } }),
    ).toBe('assistant shell call: {"call_id":"call-2","action":{"commands":["ls"]}}');
  });
});
