import { expect, test } from "@jest/globals";
import { transitionPendingRecoveryState } from "../../src/agent/session-pending-outcome-transition.mjs";

test("records a completed response and clears pending calls", () => {
  const state = { response_id: "previous", pending_tool_calls: [{ id: "call" }] };
  expect(
    transitionPendingRecoveryState(
      { status: "completed", response: { id: "next" } },
      state,
      () => "done",
    ),
  ).toEqual({
    response_id: "next",
    last_assistant_message: "done",
    pending_tool_calls: [],
  });
  expect(state.pending_tool_calls).toHaveLength(1);
});

test("keeps the current response ID when a completed response has no ID", () => {
  expect(
    transitionPendingRecoveryState(
      { status: "completed", response: { output_text: "done" } },
      { response_id: "previous", pending_tool_calls: [] },
      () => "done",
    ).response_id,
  ).toBe("previous");
});

test("keeps the response ID and applies the pending-call failure policy", () => {
  const state = { response_id: "previous", pending_tool_calls: [{ id: "call" }] };
  expect(
    transitionPendingRecoveryState(
      { status: "failed", preservePendingCalls: true },
      state,
      () => "unused",
    ),
  ).toMatchObject({
    response_id: "previous",
    failed_response: true,
    pending_tool_calls: state.pending_tool_calls,
  });
  expect(
    transitionPendingRecoveryState(
      { status: "failed", preservePendingCalls: false },
      state,
      () => "unused",
    ).pending_tool_calls,
  ).toEqual([]);
});
