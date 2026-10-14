import { describe, expect, test } from "@jest/globals";
import { extractTextFromResponse, isFunctionCall } from "../src/response-parts.mjs";

describe("response parts", () => {
  test("extracts message text and classifies function calls", () => {
    expect(extractTextFromResponse()).toBe("");
    expect(extractTextFromResponse({ output: [{ type: "reasoning" }, { type: "message" }] })).toBe(
      "",
    );
    expect(
      extractTextFromResponse({ output: [{ type: "message", content: [{ type: "other" }] }] }),
    ).toBe("");
    expect(extractTextFromResponse({ output: [{ type: "message" }] })).toBe("");
    expect(
      extractTextFromResponse({
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: "one" },
              { type: "output_text", text: "two" },
            ],
          },
        ],
      }),
    ).toBe("one\ntwo");
    expect(isFunctionCall({ type: "function_call" })).toBe(true);
    expect(isFunctionCall({ type: "message" })).toBe(false);
  });
});
