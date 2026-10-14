import { describe, expect, test } from "@jest/globals";
import { formatContentTranscript, textFromContent } from "../src/response-format-content.mjs";

describe("response content transcript", () => {
  test("formats messages, refusals, roles, empty content, and reasoning", () => {
    expect(
      formatContentTranscript({
        role: "assistant",
        type: "message",
        content: [
          { type: "input_text", text: "line one" },
          { type: "output_text", text: "line two" },
          { type: "refusal", refusal: "nope" },
        ],
      }),
    ).toBe("assistant: line one\nline two\n[refusal] nope");
    expect(textFromContent(null)).toBeUndefined();
    expect(textFromContent([{ type: "input_text" }, { text: "text" }])).toBe("text");
    expect(formatContentTranscript({ type: "message", content: [] })).toBe("");
    expect(formatContentTranscript({ type: "reasoning", summary: [{ text: "plan" }] })).toBe(
      "plan",
    );
    expect(formatContentTranscript({ type: "other" })).toBeUndefined();
  });
});
