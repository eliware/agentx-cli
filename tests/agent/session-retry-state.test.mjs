import { expect, jest, test } from "@jest/globals";
import { persistSessionRetryState } from "../../src/agent/session-retry-state.mjs";

test("persists retry request and transaction context", async () => {
  const setPendingRetryRequest = jest.fn();
  const setPendingTransaction = jest.fn();
  const saveState = jest.fn();
  await persistSessionRetryState({
    request: { input: ["result"] },
    response: { id: "response-1" },
    getPendingTransaction: () => ({ attempt_count: 2 }),
    getPendingToolCalls: () => [{ call_id: "tool-1" }],
    getExecutionJournal: () => [{ identity: "shell:test" }],
    setPendingRetryRequest,
    setPendingTransaction,
    saveState,
  });
  expect(setPendingRetryRequest).toHaveBeenCalledWith({ input: ["result"] });
  expect(setPendingTransaction).toHaveBeenCalledWith({
    attempt_count: 3,
    base_response_id: "response-1",
    request: { input: ["result"] },
    calls: [{ call_id: "tool-1" }],
    outputs: ["result"],
    execution_journal: [{ identity: "shell:test" }],
  });
  expect(saveState).toHaveBeenCalledTimes(1);
});

test("uses saved response and empty transaction defaults", async () => {
  const setPendingTransaction = jest.fn();
  await persistSessionRetryState({
    request: null,
    response: null,
    getPendingTransaction: () => undefined,
    getPendingToolCalls: () => [],
    getExecutionJournal: () => [],
    setPendingRetryRequest: jest.fn(),
    setPendingTransaction,
    saveState: jest.fn(),
  });
  expect(setPendingTransaction).toHaveBeenCalledWith({
    base_response_id: "",
    request: null,
    calls: [],
    outputs: [],
    execution_journal: [],
    attempt_count: 1,
  });
});
