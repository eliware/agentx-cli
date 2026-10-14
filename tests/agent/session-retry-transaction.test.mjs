import { expect, test } from "@jest/globals";
import { buildSessionRetryTransaction } from "../../src/agent/session-retry-transaction.mjs";

test("builds a retry transaction from the request and pending tool state", () => {
  expect(
    buildSessionRetryTransaction({
      request: { input: ["result"] },
      response: { id: "response-1" },
      transaction: { attempt_count: 2 },
      calls: [{ call_id: "tool-1" }],
      executionJournal: [{ identity: "shell:test" }],
    }),
  ).toEqual({
    attempt_count: 3,
    base_response_id: "response-1",
    request: { input: ["result"] },
    calls: [{ call_id: "tool-1" }],
    outputs: ["result"],
    execution_journal: [{ identity: "shell:test" }],
  });
});

test("uses saved response and empty transaction defaults", () => {
  expect(
    buildSessionRetryTransaction({
      request: null,
      response: null,
      transaction: undefined,
      calls: [],
      executionJournal: [],
    }),
  ).toEqual({
    base_response_id: "",
    request: null,
    calls: [],
    outputs: [],
    execution_journal: [],
    attempt_count: 1,
  });
});
