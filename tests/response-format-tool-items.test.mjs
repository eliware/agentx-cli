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
  });

  test("bounds sensitive and large result fields", () => {
    const result = compactTranscriptJson({
      encrypted_content: "secret",
      result: "x".repeat(501),
      output: [{ stdout: "x".repeat(150), stderr: "y".repeat(150) }],
    });
    expect(result).toContain("[encrypted reasoning omitted]");
    expect(result).toContain("[large result omitted: 501 chars]");
    expect(result).toContain("x".repeat(120));
    expect(result).not.toContain("x".repeat(121));
  });
});
