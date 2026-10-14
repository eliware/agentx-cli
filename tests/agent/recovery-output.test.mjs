import { expect, test } from "@jest/globals";
import { buildInterruptedToolOutput } from "../../src/agent/recovery-output.mjs";

test("builds shell output with request guidance", () => {
  expect(buildInterruptedToolOutput({ type: "shell_call", call_id: "c1" }, "request")).toEqual({
    type: "shell_call_output",
    call_id: "c1",
    status: "completed",
    output: [
      {
        stdout: expect.stringContaining("Stop all further tool calls"),
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      },
    ],
  });
});

test("builds retry guidance for function calls", () => {
  expect(buildInterruptedToolOutput({ type: "function_call", call_id: "c1" }, "retry")).toContain(
    "Think carefully",
  );
});
