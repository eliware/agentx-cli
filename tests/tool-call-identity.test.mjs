import { describe, expect, test } from "@jest/globals";
import {
  dedupeToolCalls,
  dedupeToolOutputs,
  toolCallIdentity,
} from "../src/tool-call-identity.mjs";

describe("tool call identity", () => {
  test("uses explicit IDs or stable value-based identity", () => {
    expect(toolCallIdentity({ call_id: "call-1" }, "/work")).toBe("id:call-1");
    expect(toolCallIdentity({ type: "function_call", input: { z: 1, a: 2 } })).toBe(
      toolCallIdentity({ type: "function_call", input: { a: 2, z: 1 } }),
    );
    expect(toolCallIdentity(null)).toBe(
      `hash:${JSON.stringify({ action: {}, arguments: "", cwd: "", name: "", type: "" })}`,
    );
  });

  test("deduplicates calls by ID and fallback identity", () => {
    const first = { type: "shell_call", call_id: "id", action: { commands: ["one"] } };
    const second = { type: "shell_call", call_id: "id", action: { commands: ["two"] } };
    const noId = { type: "shell_call", action: { commands: ["same"] } };
    expect(dedupeToolCalls([first, second, noId, { ...noId }])).toEqual([first, noId]);
    expect(dedupeToolCalls([])).toEqual([]);
  });

  test("deduplicates outputs by call ID or canonical contents", () => {
    expect(
      dedupeToolOutputs([
        { call_id: "id", output: "first" },
        { call_id: "id", output: "second" },
        { output: { a: 1, b: 2 } },
        { output: { b: 2, a: 1 } },
      ]),
    ).toEqual([{ call_id: "id", output: "first" }, { output: { a: 1, b: 2 } }]);
  });
});
