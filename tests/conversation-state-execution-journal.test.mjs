import { expect, test } from "@jest/globals";
import { normalizeExecutionJournal } from "../src/conversation-state-execution-journal.mjs";

test("normalizes execution records and ignores malformed entries", () => {
  expect(
    normalizeExecutionJournal([
      null,
      { identity: 42, status: "started", response_id: 7, updated_at: 9 },
      { identity: 8 },
      { identity: "" },
      { identity: null },
    ]),
  ).toEqual([
    { identity: "42", status: "started", response_id: "7", updated_at: "9" },
    { identity: "8", status: "pending", response_id: "", updated_at: "" },
  ]);
  expect(normalizeExecutionJournal("bad")).toEqual([]);
});
