import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { handleToolCalls } from "../../src/agent-turn/tool-loop.mjs";

let stdoutWrite;
beforeEach(() => {
  stdoutWrite = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => stdoutWrite.mockRestore());

test("the matching implementation exports its public function", async () => {
  const source = await import("../../src/agent-turn/tool-loop.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});

test("returns an empty response and accounts for its usage", async () => {
  const response = {
    id: "empty",
    usage: { input_tokens: 3, output_tokens: 2 },
  };
  const usage = jest.fn();
  await expect(handleToolCalls({}, response, {}, "/repo", usage)).resolves.toBe(response);
  expect(usage.mock.calls[0][0]).toEqual({ inputTokens: 3, cachedTokens: 0, outputTokens: 2 });
  await expect(
    handleToolCalls({}, response, {}, "/repo", null, undefined, {
      liveStreaming: true,
      suppressStatusOutput: true,
      colors: false,
    }),
  ).resolves.toBe(response);
});

test("stops before a goal cycle when cancellation is active", async () => {
  const response = { id: "cancelled", output: [] };
  const clear = jest.fn();
  await expect(
    handleToolCalls({}, response, {}, "/repo", null, undefined, {
      goalMode: true,
      isGoalCancelled: () => true,
      statusController: { clear },
    }),
  ).resolves.toBe(response);
  expect(clear).toHaveBeenCalled();
});

test("returns the current response when a tool call cancels a goal", async () => {
  let cancelled = false;
  const response = {
    id: "before-cancel",
    output: [{ type: "shell_call", call_id: "shell-1", action: { commands: ["echo hi"] } }],
  };
  const result = await handleToolCalls({}, response, {}, "/repo", null, undefined, {
    goalMode: true,
    isGoalCancelled: () => cancelled,
    runToolCall: async () => {
      cancelled = true;
      return { output: "done" };
    },
    suppressUsageOutput: true,
  });
  expect(result).toBe(response);
});

test("completes a goal after its final tool decision", async () => {
  const response = {
    id: "goal-response",
    output: [
      {
        type: "function_call",
        call_id: "goal-1",
        name: "goal_update",
        arguments: '{"method":"complete","result":"done"}',
      },
    ],
  };
  const final = { id: "goal-final", output: [] };
  const openai = { responses: { create: jest.fn().mockResolvedValue(final) } };
  await expect(
    handleToolCalls(openai, response, { model: "test" }, "/repo", null, undefined, {
      goalMode: true,
      suppressUsageOutput: true,
      suppressStatusOutput: true,
    }),
  ).resolves.toBe(final);
  expect(openai.responses.create.mock.calls[0][0]).toMatchObject({ tool_choice: "none" });
});

test("continues after an empty goal cycle and after a tool response", async () => {
  const goalOpenai = {
    responses: { create: jest.fn().mockResolvedValue({ id: "empty-next", output: [] }) },
  };
  await expect(
    handleToolCalls(goalOpenai, { id: "empty-start", output: [] }, {}, "/repo", null, undefined, {
      goalMode: true,
      goalMaxIterations: 1,
      suppressUsageOutput: true,
      suppressStatusOutput: true,
    }),
  ).resolves.toMatchObject({ id: "empty-next", output: [] });

  const next = { id: "after-tool", output: [] };
  const openai = { responses: { create: jest.fn().mockResolvedValue(next) } };
  const response = {
    id: "tool-start",
    output: [{ type: "function_call", name: "agent_status", call_id: "status", arguments: "{}" }],
  };
  await expect(
    handleToolCalls(openai, response, {}, "/repo", null, async () => "status", {
      suppressUsageOutput: true,
      suppressStatusOutput: true,
    }),
  ).resolves.toBe(next);
});
