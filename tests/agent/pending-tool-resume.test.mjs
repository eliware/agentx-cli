import { describe, expect, jest, test } from "@jest/globals";
import { resumePendingToolExecution } from "../../src/agent/pending-tool-resume.mjs";

describe("pending tool resume coordinator", () => {
  test.each([
    ["interrupt-retry", "retry"],
    ["interrupt-request", "request"],
  ])("skips interrupted calls for %s", async (choice, expectedMode) => {
    const createRunner = jest.fn(() => "resume-runner");
    const execute = jest.fn(async () => ({ id: "response-next" }));
    const savedState = {
      pending_tool_calls: [{ id: "call-1" }, { call_id: "call-2" }],
      execution_journal: [
        { identity: "tool-1", status: "started" },
        { identity: "tool-2", status: "completed" },
        { identity: "", status: "started" },
      ],
    };

    const result = await resumePendingToolExecution({
      choice,
      savedState,
      createRunner,
      execute,
    });

    expect(createRunner).toHaveBeenCalledWith(
      expectedMode,
      new Set(["call-1", "call-2"]),
      new Set(["tool-1"]),
    );
    expect(execute).toHaveBeenCalledWith("resume-runner");
    expect(result).toEqual({ status: "completed", response: { id: "response-next" } });
  });

  test("auto-resume retries all calls without interruption identities", async () => {
    const createRunner = jest.fn(() => "runner");
    const execute = jest.fn(async () => null);

    const result = await resumePendingToolExecution({
      choice: "auto-resume",
      savedState: {
        pending_tool_calls: [{ id: "call-1" }],
        execution_journal: [{ identity: "tool-1", status: "started" }],
      },
      createRunner,
      execute,
    });

    expect(createRunner).toHaveBeenCalledWith("auto", new Set(), new Set());
    expect(result).toEqual({ status: "completed", response: null });
  });

  test("classifies a missing prior response for clearing", async () => {
    const error = Object.assign(new Error("missing"), {
      code: "previous_response_not_found",
    });

    await expect(
      resumePendingToolExecution({
        choice: "interrupt-request",
        savedState: {},
        pendingTransaction: { request: {} },
        createRunner: () => () => {},
        execute: async () => {
          throw error;
        },
      }),
    ).resolves.toEqual({
      status: "missing-response",
      error,
      preservePendingCalls: true,
    });
  });

  test.each([
    [{ request: {} }, true],
    [{ request: null }, false],
    [null, false],
  ])("reports ordinary failure pending preservation for %j", async (transaction, preserve) => {
    const error = new Error("resume failed");

    await expect(
      resumePendingToolExecution({
        choice: "interrupt-request",
        savedState: {},
        pendingTransaction: transaction,
        createRunner: () => () => {},
        execute: async () => {
          throw error;
        },
      }),
    ).resolves.toEqual({ status: "failed", error, preservePendingCalls: preserve });
  });
});
