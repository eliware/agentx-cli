import { expect, test } from "@jest/globals";
import { normalizeHistory } from "../src/conversation-state-history-normalization.mjs";

test("normalizes valid history entries and keeps the latest twenty", () => {
  const history = [null, {}, { response_id: "" }];
  for (let index = 0; index < 22; index += 1)
    history.push({
      response_id: `r${index}`,
      timestamp: 9,
      user_preview: "u".repeat(25),
      assistant_preview: null,
      usage: { inputTokens: "1", cachedTokens: "2", outputTokens: "3", turns: "4" },
      last_user_message: false,
      last_assistant_message: 5,
    });
  const normalized = normalizeHistory(history);
  expect(normalized).toHaveLength(20);
  expect(normalized[0]).toEqual({
    response_id: "r2",
    timestamp: "9",
    user_preview: "u".repeat(20),
    assistant_preview: "",
    usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 },
    last_user_message: "false",
    last_assistant_message: "5",
  });
  expect(normalizeHistory("bad")).toEqual([]);
});
