import { describe, expect, test, jest } from "@jest/globals";
import { executeOneToolCall } from "../../src/agent-turn/tool-call-execution.mjs";

describe("single tool call execution", () => {
  test("executes a shell call and reports its lifecycle", async () => {
    const executeToolCall = jest.fn().mockResolvedValue({
      type: "shell_call_output",
      output: [{ stdout: "done", stderr: "", outcome: { type: "exit", exit_code: 0 } }],
    });
    const onToolExecutionState = jest.fn();
    const result = await executeOneToolCall({
      call: { type: "shell_call", call_id: "c1" },
      callIndex: 0,
      calls: [{}],
      cwd: process.cwd(),
      currentResponse: { id: "r1" },
      isFirstResponse: false,
      executeToolCall,
      streamOptions: { onToolExecutionState },
      statusController: null,
      goalMode: false,
    });
    expect(result.cancelled).toBe(false);
    expect(executeToolCall).toHaveBeenCalled();
    expect(onToolExecutionState).toHaveBeenCalledTimes(2);
  });

  test("stops before execution when goal mode has a cancellation", async () => {
    const executeToolCall = jest.fn();
    const result = await executeOneToolCall({
      call: { type: "shell_call" },
      callIndex: 0,
      calls: [{}],
      cwd: process.cwd(),
      executeToolCall,
      streamOptions: { isGoalCancelled: () => true },
      goalMode: true,
    });
    expect(result).toEqual({ cancelled: true });
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  test("stops after a goal question is cancelled while waiting for an answer", async () => {
    let cancelled = false;
    const onToolExecutionState = jest.fn();
    const result = await executeOneToolCall({
      call: { type: "function_call", name: "goal_blocked", arguments: "{}" },
      callIndex: 0,
      calls: [{}],
      cwd: process.cwd(),
      currentResponse: { id: "goal-response" },
      streamOptions: {
        isGoalCancelled: () => cancelled,
        onToolExecutionState,
        onGoalBlocked: async () => {
          cancelled = true;
          return "answer";
        },
      },
      goalMode: true,
      goalState: { finished: false },
    });
    expect(result).toEqual({ cancelled: true });
    expect(onToolExecutionState).toHaveBeenCalledTimes(1);
  });

  test("parses image arguments and uses the unavailable result when no handler exists", async () => {
    const onViewImage = jest.fn(async () => "image details");
    const result = await executeOneToolCall({
      call: { type: "function_call", name: "view_image", arguments: "{bad" },
      calls: [{}],
      cwd: process.cwd(),
      streamOptions: { onViewImage },
      goalMode: false,
    });
    expect(onViewImage).toHaveBeenCalledWith(expect.objectContaining({ args: {} }));
    expect(result.output.output).toBe("image details");

    const missing = await executeOneToolCall({
      call: { type: "function_call", name: "view_image", input: '{"path":"image.png"}' },
      calls: [{}],
      cwd: process.cwd(),
      streamOptions: {},
      goalMode: false,
    });
    expect(missing.output.output).toBe("ERROR: image inspection is unavailable");
    const fallback = await executeOneToolCall({
      call: { type: "function_call", name: "view_image", arguments: null, input: '{"path":"x"}' },
      calls: [{}],
      cwd: "/repo",
      streamOptions: { onViewImage: jest.fn(async () => "") },
      goalMode: false,
    });
    expect(fallback.output.output).toBe("ERROR: image inspection is unavailable");
    const emptyInput = await executeOneToolCall({
      call: { type: "function_call", name: "view_image" },
      calls: [{}],
      cwd: "/repo",
      streamOptions: { onViewImage: jest.fn(async ({ args }) => JSON.stringify(args)) },
      goalMode: false,
    });
    expect(emptyInput.output.output).toBe("{}");
  });
});
