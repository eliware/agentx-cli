import { describe, expect, test } from "@jest/globals";
import { responseItemToTranscript } from "../../src/agent-turn/response-format.mjs";

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

  test("dispatches shell calls to the tool formatter", () => {
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

  test("formats reasoning and unknown response items", () => {
    expect(responseItemToTranscript({ type: "reasoning", summary: [] })).toBe("");
    expect(responseItemToTranscript({ type: "reasoning" })).toBe("");
    expect(
      responseItemToTranscript({
        type: "reasoning",
        summary: [{ type: "output_text", text: "plan" }],
      }),
    ).toBe("plan");
    expect(responseItemToTranscript({ role: "assistant" })).toBe('assistant: {"role":"assistant"}');
    expect(responseItemToTranscript({ type: "note", message: "fallback" })).toBe(
      'note: {"type":"note","message":"fallback"}',
    );
    expect(responseItemToTranscript({})).toBe("item: {}");
  });
});
