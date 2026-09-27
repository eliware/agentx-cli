import { describe, expect, jest as testMocks, test } from "@jest/globals";
import { executeToolCallSequence } from "../src/agent-turn/tool-call-runner.mjs";

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

  test("declines a destructive call after confirmation and serializes an incomplete result", async () => {
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

  test("runs confirmed calls and honors yolo without prompting", async () => {
    const call = shellCall("safe", "shutdown now");
    const confirmToolCall = testMocks.fn().mockResolvedValue(true);
    const executeToolCall = testMocks.fn().mockResolvedValue({
      type: "shell_call_output",
      call_id: "safe",
      status: "completed",
      output: [],
    });
    const result = await executeToolCallSequence({
      calls: [call],
      cwd: ".",
      executeToolCall,
      streamOptions: { yolo: true, confirmToolCall },
    });
    expect(confirmToolCall).not.toHaveBeenCalled();
    expect(result.outputs[0].status).toBe("completed");
  });

  test("uses default execution options when none are supplied", async () => {
    const result = await executeToolCallSequence({
      calls: [functionCall("default-options")],
      cwd: ".",
      executeToolCall: async () => "ok",
    });
    expect(result.outputs[0].output).toBe("ok");
  });

  test("routes goal tool calls through goal lifecycle handling", async () => {
    const goalState = { finished: false, completionSnapshot: null };
    const onGoalComplete = testMocks.fn();
    const result = await executeToolCallSequence({
      calls: [functionCall("goal", "goal_update", '{"method":"complete","result":"done"}')],
      cwd: ".",
      currentResponse: { id: "goal-response" },
      executeToolCall: testMocks.fn(),
      goalMode: true,
      goalState,
      streamOptions: { onGoalComplete },
    });
    expect(goalState.finished).toBe(true);
    expect(onGoalComplete).toHaveBeenCalledWith({ method: "complete", result: "done" });
    expect(result.outputs[0].output).toBe("Goal complete acknowledged.");
  });

  test("stops after the goal is cancelled during tool-state notification", async () => {
    let cancelled = false;
    const executeToolCall = testMocks.fn();
    const result = await executeToolCallSequence({
      calls: [functionCall("one"), functionCall("two")],
      cwd: ".",
      executeToolCall,
      goalMode: true,
      streamOptions: {
        isGoalCancelled: () => cancelled,
        onToolExecutionState: async ({ status }) => {
          if (status === "started") cancelled = true;
        },
      },
    });
    expect(result).toEqual({ outputs: [], cancelled: true });
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  test("parses image arguments and reports inspection unavailability when absent", async () => {
    const validCall = functionCall("image-valid", "view_image", '{"images":["a.png"]}');
    const invalidCall = functionCall("image-invalid", "view_image", "not-json");
    const onViewImage = testMocks
      .fn()
      .mockResolvedValueOnce("inspected")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("from-input")
      .mockResolvedValueOnce("empty-input");
    const result = await executeToolCallSequence({
      calls: [
        validCall,
        invalidCall,
        { type: "function_call", call_id: "image-input", name: "view_image", input: "{}" },
        { type: "function_call", call_id: "image-empty", name: "view_image" },
      ],
      cwd: "C:\\work",
      currentResponse: { id: "caller" },
      previousResponseId: "previous",
      baseRequest: { model: "gpt-test" },
      executeToolCall: testMocks.fn(),
      streamOptions: { onViewImage },
    });
    expect(onViewImage).toHaveBeenNthCalledWith(1, {
      args: { images: ["a.png"] },
      response: { id: "caller" },
      previousResponseId: "previous",
      baseRequest: { model: "gpt-test" },
      cwd: "C:\\work",
    });
    expect(onViewImage).toHaveBeenNthCalledWith(2, expect.objectContaining({ args: {} }));
    expect(onViewImage).toHaveBeenNthCalledWith(3, expect.objectContaining({ args: {} }));
    expect(onViewImage).toHaveBeenNthCalledWith(4, expect.objectContaining({ args: {} }));
    expect(result.outputs.map(({ output }) => output)).toEqual([
      "inspected",
      "ERROR: image inspection is unavailable",
      "from-input",
      "empty-input",
    ]);
  });

  test("flushes worker completion callbacks and ignores absent worker records", async () => {
    const onWorkerComplete = testMocks.fn();
    const onToolExecutionState = testMocks.fn();
    const status = {
      isWriting: () => false,
      showExecuting: testMocks.fn(),
      updateExecuting: testMocks.fn(),
      pause: testMocks.fn(),
      resume: testMocks.fn(),
      clear: testMocks.fn(),
    };
    await executeToolCallSequence({
      calls: [functionCall("worker")],
      cwd: ".",
      executeToolCall: async (_call, _cwd, options) => {
        options.onWorkerComplete({ id: "worker-1" });
        options.onWorkerComplete(null);
        return { ok: true };
      },
      statusController: status,
      streamOptions: { onWorkerComplete, onToolExecutionState },
    });
    expect(onWorkerComplete).toHaveBeenCalledTimes(1);
    expect(onWorkerComplete).toHaveBeenCalledWith({ id: "worker-1" });
    expect(status.pause).toHaveBeenCalled();
    expect(status.resume).toHaveBeenCalledWith({ renderNow: false });
  });

  test("clears status and propagates a tool-state callback failure", async () => {
    const error = new Error("state write failed");
    const status = { showExecuting: testMocks.fn(), clear: testMocks.fn() };
    await expect(
      executeToolCallSequence({
        calls: [functionCall("one")],
        cwd: ".",
        executeToolCall: testMocks.fn(),
        statusController: status,
        streamOptions: { onToolExecutionState: testMocks.fn().mockRejectedValue(error) },
      }),
    ).rejects.toBe(error);
    expect(status.clear).toHaveBeenCalledTimes(1);
  });
});
