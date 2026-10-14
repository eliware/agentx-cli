import { expect, jest, test } from "@jest/globals";
import { restorePendingSessionCheckpoint } from "../../src/agent/pending-session-abandonment-transition.mjs";

test("restores saved fields and clones checkpoint usage", () => {
  const checkpoint = {
    response_id: "saved",
    last_user_message: "question",
    last_assistant_message: "answer",
    usage: { turns: 2 },
  };
  const result = restorePendingSessionCheckpoint(
    {
      response_id: "pending",
      usage: { turns: 9 },
      pending_transaction: { request: {} },
      pending_tool_calls: [{ id: "call" }],
      pending_retry_request: { input: [] },
      failed_response: true,
      history: [checkpoint],
    },
    jest.fn(),
  );
  expect(result.checkpoint).toBe(checkpoint);
  expect(result.state).toMatchObject({
    response_id: "saved",
    last_user_message: "question",
    last_assistant_message: "answer",
    usage: { turns: 2 },
    pending_tool_calls: [],
    pending_transaction: null,
    pending_retry_request: null,
    failed_response: false,
  });
  expect(result.state.usage).not.toBe(checkpoint.usage);
});

test("returns an empty state when no checkpoint exists", () => {
  const createUsageTotals = jest.fn(() => ({ turns: 0 }));
  const result = restorePendingSessionCheckpoint({ history: [] }, createUsageTotals);
  expect(result.checkpoint).toBeUndefined();
  expect(result.state).toMatchObject({
    response_id: "",
    last_user_message: "",
    last_assistant_message: "",
    usage: { turns: 0 },
  });
  expect(createUsageTotals).toHaveBeenCalledTimes(1);
});
