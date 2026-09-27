import { describe, expect, test } from "@jest/globals";
import { toolOutputForCall } from "../src/tool-output-adapter.mjs";

describe("tool output adapter", () => {
  test("normalizes function outputs and serializes non-string values", () => {
    expect(toolOutputForCall({ type: "function_call", call_id: "call-fn" }, "done")).toEqual({
      type: "function_call_output",
      call_id: "call-fn",
      output: "done",
    });
    expect(toolOutputForCall({ type: "function_call", id: "call-id" }, { done: true })).toEqual({
      type: "function_call_output",
      call_id: "call-id",
      output: '{"done":true}',
    });
    expect(toolOutputForCall({ type: "function_call" }, undefined)).toEqual({
      type: "function_call_output",
      call_id: "",
      output: "",
    });
  });

  test("normalizes shell output identifiers and rejects invalid output shapes", () => {
    expect(
      toolOutputForCall(
        { type: "shell_call", call_id: "call-shell" },
        { type: "shell_call_output", call_id: "present", output: [] },
      ),
    ).toEqual({ type: "shell_call_output", call_id: "present", output: [] });
    expect(
      toolOutputForCall(
        { type: "shell_call", id: "call-shell-id" },
        { type: "shell_call_output", call_id: "", output: [] },
      ),
    ).toEqual({ type: "shell_call_output", call_id: "call-shell-id", output: [] });
    expect(
      toolOutputForCall(
        { type: "shell_call", call_id: "parent-id" },
        { type: "shell_call_output", call_id: "", output: [] },
      ),
    ).toEqual({ type: "shell_call_output", call_id: "parent-id", output: [] });
    expect(
      toolOutputForCall({ type: "shell_call" }, { type: "shell_call_output", output: [] }),
    ).toEqual({ type: "shell_call_output", call_id: "", output: [] });
    expect(() => toolOutputForCall({ type: "shell_call" }, "wrong shape")).toThrow(
      "shell_call must return shell_call_output",
    );
    expect(toolOutputForCall({ type: "other", call_id: "other-id" }, null)).toEqual({
      type: "function_call_output",
      call_id: "other-id",
      output: "",
    });
    expect(toolOutputForCall({ type: "other" }, undefined)).toEqual({
      type: "function_call_output",
      call_id: "",
      output: "",
    });
  });
});
