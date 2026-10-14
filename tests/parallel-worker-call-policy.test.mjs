import { expect, test } from "@jest/globals";
import {
  isParallelWorkerFunctionCall,
  unsupportedParallelWorkerCall,
  validateParallelWorkerCall,
} from "../src/parallel-worker-call-policy.mjs";

const call = (name, type = "function_call") => ({ type, name });

test("classifies only supported worker function calls", () => {
  expect(isParallelWorkerFunctionCall(call("spawn_agent"))).toBe(true);
  expect(isParallelWorkerFunctionCall(call("agent_status"))).toBe(true);
  expect(isParallelWorkerFunctionCall(call("cancel_agent"))).toBe(true);
  expect(isParallelWorkerFunctionCall(call("spawn_agent", "shell_call"))).toBe(false);
  expect(isParallelWorkerFunctionCall(call("other_tool"))).toBe(false);
});

test("validates call shape and working directory", () => {
  expect(validateParallelWorkerCall(null, process.cwd())).toEqual({
    error: "invalid worker function call",
  });
  expect(validateParallelWorkerCall([], process.cwd())).toEqual({
    error: "invalid worker function call",
  });
  expect(validateParallelWorkerCall(call("agent_status"), " ")).toEqual({
    error: "invalid working directory",
  });
  expect(validateParallelWorkerCall(call("agent_status"), process.cwd())).toBeNull();
});

test("formats unsupported worker call errors", () => {
  expect(unsupportedParallelWorkerCall(call("other_tool"))).toEqual({
    error: "unsupported worker function other_tool",
  });
  expect(unsupportedParallelWorkerCall({})).toEqual({ error: "unsupported worker function " });
});
