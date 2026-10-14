import { expect, test } from "@jest/globals";
import { updateExecutionJournal } from "../../src/agent/execution-journal.mjs";

test("replaces matching records, bounds history, and defaults missing fields", () => {
  const entries = Array.from({ length: 100 }, (_, index) => ({
    identity: `entry-${index}`,
    status: "pending",
  }));
  const updated = updateExecutionJournal(
    { execution_journal: entries },
    {
      call: { call_id: "call-1" },
      response: { id: "response-1" },
      status: "started",
      identity: "entry-50",
    },
  );
  expect(updated.execution_journal).toHaveLength(100);
  expect(updated.execution_journal.find(({ identity }) => identity === "entry-50")).toMatchObject({
    status: "started",
    response_id: "response-1",
  });

  const defaulted = updateExecutionJournal({}, { call: { id: "call-2" }, status: "completed" });
  expect(defaulted.execution_journal[0]).toMatchObject({
    identity: "id:call-2",
    status: "completed",
    response_id: "",
  });
  expect(Number.isNaN(Date.parse(defaulted.execution_journal[0].updated_at))).toBe(false);
});
