import { describe, expect, test } from "@jest/globals";
import { createResponseTextRenderer } from "../../src/agent-turn/response-text-renderer.mjs";

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

  test("emits an incomplete CSI fragment once at flush", () => {
    const writes = [];
    const renderer = createResponseTextRenderer((text) => writes.push(text));
    renderer.writeTextDelta("text\u001b[31");
    renderer.flushTextDelta();
    expect(writes.join("")).toBe("\u001b[38;5;255mtext\u001b[31");
    const initialWrites = [];
    const initialRenderer = createResponseTextRenderer((text) => initialWrites.push(text));
    initialRenderer.writeTextDelta("\u001b[32");
    initialRenderer.flushTextDelta();
    expect(initialWrites.join("")).toBe("\u001b[38;5;255m\u001b[32");
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
