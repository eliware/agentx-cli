import { describe, expect, jest as testMocks, test } from "@jest/globals";
import { executeToolCallSequence } from "../../src/agent-turn/tool-call-runner.mjs";

const shellCall = (callId, command = "pwd") => ({
  type: "shell_call",
  call_id: callId,
  action: { commands: [command] },
});
const functionCall = (callId, name = "lookup", argumentsValue = "{}") => ({
  type: "function_call",
  call_id: callId,
  name,
  arguments: argumentsValue,
});

describe("tool call runner", () => {
  test("executes calls sequentially and records their lifecycle and outputs", async () => {
    const order = [];
    const states = [];
    const status = {
      showExecuting: testMocks.fn(),
      updateExecuting: testMocks.fn(),
      clear: testMocks.fn(),
    };
    const calls = [functionCall("one"), functionCall("two")];
    const result = await executeToolCallSequence({
      calls,
      cwd: ".",
      currentResponse: { id: "response" },
      previousResponseId: "parent",
      baseRequest: { model: "test" },
      isFirstResponse: true,
      statusController: status,
      executeToolCall: async (call, _cwd, context) => {
        order.push(`start:${call.call_id}`);
        expect(context.callCount).toBe(2);
        await Promise.resolve();
        order.push(`end:${call.call_id}`);
        return call.call_id;
      },
      streamOptions: {
        onToolExecutionState: async (state) => states.push(state),
      },
    });
    expect(order).toEqual(["start:one", "end:one", "start:two", "end:two"]);
    expect(result.cancelled).toBe(false);
    expect(result.outputs).toEqual([
      { type: "function_call_output", call_id: "one", output: "one" },
      { type: "function_call_output", call_id: "two", output: "two" },
    ]);
    expect(states.map(({ status }) => status)).toEqual([
      "started",
      "completed",
      "started",
      "completed",
    ]);
    expect(status.updateExecuting).toHaveBeenCalledTimes(2);
    expect(status.clear).toHaveBeenCalledTimes(1);
  });
  test("coordinates a declined call without execution and returns its incomplete result", async () => {
    const executeToolCall = testMocks.fn();
    const status = {
      showExecuting: testMocks.fn(),
      pause: testMocks.fn(),
      resume: testMocks.fn(),
      clear: testMocks.fn(),
    };
    const result = await executeToolCallSequence({
      calls: [shellCall("danger", "shutdown now")],
      cwd: ".",
      currentResponse: { id: "r1" },
      executeToolCall,
      statusController: status,
      streamOptions: { yolo: false, confirmToolCall: async () => false },
    });
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(result.outputs[0]).toMatchObject({
      type: "shell_call_output",
      call_id: "danger",
      status: "incomplete",
      output: [{ stderr: "Tool execution declined by user." }],
    });
    expect(status.pause).toHaveBeenCalled();
    expect(status.resume).toHaveBeenCalledWith({ renderNow: false });
  });
  test("uses default execution options when none are supplied", async () => {
    const result = await executeToolCallSequence({
      calls: [functionCall("default-options")],
      cwd: ".",
      executeToolCall: async () => "ok",
    });
    expect(result.outputs[0].output).toBe("ok");
  });

  test("flushes worker completion while the status display is active", async () => {
    const worker = { id: "worker-1" };
    const status = {
      showExecuting: testMocks.fn(),
      updateExecuting: testMocks.fn(),
      pause: testMocks.fn(),
      resume: testMocks.fn(),
      isWriting: () => false,
      clear: testMocks.fn(),
    };
    const completed = testMocks.fn();
    await executeToolCallSequence({
      calls: [functionCall("worker-call")],
      cwd: ".",
      statusController: status,
      streamOptions: { onWorkerComplete: completed },
      executeToolCall: async (_call, _cwd, options) => {
        options.onWorkerComplete(worker);
        return "done";
      },
    });
    expect(completed).toHaveBeenCalledWith(worker);
    expect(status.pause).toHaveBeenCalled();
    expect(status.resume).toHaveBeenCalledWith({ renderNow: false });
  });

  test("queues a worker while status writes and skips empty worker events", async () => {
    const worker = { id: "queued" };
    const completed = testMocks.fn();
    const status = {
      showExecuting: testMocks.fn(),
      updateExecuting: testMocks.fn(),
      pause: testMocks.fn(),
      resume: testMocks.fn(),
      isWriting: () => true,
      clear: testMocks.fn(),
    };
    await executeToolCallSequence({
      calls: [functionCall("queue")],
      cwd: ".",
      statusController: status,
      streamOptions: { onWorkerComplete: completed },
      executeToolCall: async (_call, _cwd, options) => {
        options.onWorkerComplete(null);
        options.onWorkerComplete(worker);
        return "done";
      },
    });
    expect(completed).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledWith(worker);
  });

  test("returns cancellation and clears the status controller", async () => {
    const status = { showExecuting: testMocks.fn(), clear: testMocks.fn() };
    const executeToolCall = testMocks.fn();
    await expect(
      executeToolCallSequence({
        calls: [functionCall("cancelled")],
        cwd: ".",
        statusController: status,
        goalMode: true,
        streamOptions: { isGoalCancelled: () => true },
        executeToolCall,
      }),
    ).resolves.toEqual({ outputs: [], cancelled: true });
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(status.clear).toHaveBeenCalled();
  });
});
