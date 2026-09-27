import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { createToolEventRenderer } from "../../src/agent-turn/tool-event-renderer.mjs";

describe("streamed tool-event renderer", () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  test("formats shell and custom argument deltas and returns the raw text", () => {
    const writes = [];
    const renderer = createToolEventRenderer((text) => writes.push(text));

    expect(renderer.writeDelta({ type: "response.shell_call_command.delta", delta: "ls" })).toBe(
      "ls",
    );
    expect(
      renderer.writeDelta({ type: "response.function_call_arguments.delta", delta: "{}" }),
    ).toBe("{}");
    expect(writes[0]).toContain("ls");
    expect(writes[1]).toContain("{}");
    expect(writes[0]).not.toBe(writes[1]);
  });

  test("ignores empty deltas and appends a newline when an item finishes", () => {
    const writes = [];
    const renderer = createToolEventRenderer((text) => writes.push(text));

    expect(renderer.writeDelta({ type: "response.function_call_arguments.delta", delta: "" })).toBe(
      "",
    );
    expect(renderer.writeDelta({ type: "response.shell_call_command.delta" })).toBe("");
    expect(renderer.finishItem()).toBe("\n");
    expect(writes).toEqual(["\n"]);
  });

  test("writes through terminal output when no writer is injected", () => {
    const renderer = createToolEventRenderer();
    renderer.writeDelta({ type: "response.shell_call_command.delta", delta: "pwd" });
    renderer.finishItem();
    expect(stdoutWrites.join("")).toContain("pwd");
    expect(stdoutWrites.join("")).toContain("\n");
  });
});
