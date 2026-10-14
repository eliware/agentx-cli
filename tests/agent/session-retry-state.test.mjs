import { expect, jest, test } from "@jest/globals";
import { persistSessionRetryState } from "../../src/agent/session-retry-state.mjs";

test("saves retry request and transaction state in order", async () => {
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
  expect(setPendingRetryRequest).toHaveBeenCalledTimes(1);
  expect(setPendingTransaction).toHaveBeenCalledTimes(1);
  expect(saveState).toHaveBeenCalledTimes(1);
  expect(setPendingRetryRequest.mock.invocationCallOrder[0]).toBeLessThan(
    setPendingTransaction.mock.invocationCallOrder[0],
  );
  expect(setPendingTransaction.mock.invocationCallOrder[0]).toBeLessThan(
    saveState.mock.invocationCallOrder[0],
  );
});
