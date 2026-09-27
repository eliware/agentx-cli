import { describe, expect, test } from "@jest/globals";
import { createResponseTextRenderer } from "../src/agent-turn/response-text-renderer.mjs";

describe("assistant response text renderer", () => {
  test("buffers a split ANSI escape until its complete sequence arrives", () => {
    const writes = [];
    const renderer = createResponseTextRenderer((text) => writes.push(text));
    renderer.writeTextDelta("before \u001b[");
    expect(writes).toEqual(["\u001b[38;5;255mbefore "]);
    renderer.writeTextDelta("31mred");
    renderer.flushTextDelta();
    expect(writes.join("")).toBe("\u001b[38;5;255mbefore \u001b[31mred");
  });

  test("flushes incomplete and non-CSI escape fragments safely", () => {
    const writes = [];
    const renderer = createResponseTextRenderer((text) => writes.push(text));
    renderer.writeTextDelta("x\u001b");
    renderer.flushTextDelta();
    renderer.writeTextDelta("y\u001bZ");
    expect(writes.join("")).toContain("x\u001b");
    expect(writes.join("")).toContain("y\u001bZ");
  });

  test("adds the initial text color once and ignores empty deltas", () => {
    const writes = [];
    const renderer = createResponseTextRenderer((text) => writes.push(text));
    renderer.writeTextDelta("");
    renderer.writeTextDelta("first");
    renderer.writeTextDelta(" second");
    expect(writes).toEqual(["\u001b[38;5;255mfirst", " second"]);
  });
});
