import { expect, test } from "@jest/globals";
import { responseItemToTranscript } from "../../src/agent-turn/response-format.mjs";

test("dispatches message, tool, and fallback transcript formatting", () => {
  expect(
    responseItemToTranscript({
      role: "assistant",
      type: "message",
      content: [{ type: "output_text", text: "answer" }],
    }),
  ).toBe("assistant: answer");
  expect(responseItemToTranscript({ type: "function_call", name: "lookup", input: "x" })).toBe(
    "assistant tool call: lookup(x)",
  );
  expect(responseItemToTranscript({ type: "note", message: "status" })).toBe(
    'note: {"type":"note","message":"status"}',
  );
  expect(responseItemToTranscript({ role: "developer", type: "message" })).toBe("");
  expect(responseItemToTranscript({})).toBe("item: {}");
});
