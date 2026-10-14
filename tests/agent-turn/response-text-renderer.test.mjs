import { expect, test } from "@jest/globals";
import { createResponseTextRenderer } from "../../src/agent-turn/response-text-renderer.mjs";

test("adds the initial text color once and ignores empty deltas", () => {
  const writes = [];
  const renderer = createResponseTextRenderer((text) => writes.push(text));
  renderer.writeTextDelta("");
  renderer.writeTextDelta("first");
  renderer.writeTextDelta(" second");
  expect(writes).toEqual(["\u001b[38;5;255mfirst", " second"]);
});

test("writes an incomplete ANSI fragment when the renderer flushes", () => {
  const writes = [];
  const renderer = createResponseTextRenderer((text) => writes.push(text));
  renderer.writeTextDelta("text\u001b[31");
  renderer.flushTextDelta();
  expect(writes.join("")).toBe("\u001b[38;5;255mtext\u001b[31");
});
