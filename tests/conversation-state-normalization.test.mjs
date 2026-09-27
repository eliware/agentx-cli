import { describe, expect, test } from "@jest/globals";
import { normalizeSessionState } from "../src/conversation-state-normalization.mjs";

describe("session state normalization", () => {
  test("supplies defaults for absent and malformed state", () => {
    const expected = {
      response_id: "",
      usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
      last_user_message: "",
      last_assistant_message: "",
      pending_cli_transcript: "",
      pending_tool_calls: [],
    };
    expect(normalizeSessionState()).toEqual(expected);
    expect(normalizeSessionState(null)).toEqual(expected);
    expect(
      normalizeSessionState({ response_id: 4, usage: null, pending_tool_calls: "bad" }),
    ).toEqual({ ...expected, response_id: "4" });
  });

  test("normalizes usage, message fields, and history bounds", () => {
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
    const normalized = normalizeSessionState({
      response_id: 42,
      usage: { inputTokens: "8", cachedTokens: null, outputTokens: 2, turns: "3" },
      last_user_message: 7,
      last_assistant_message: false,
      pending_cli_transcript: 9,
      history,
    });
    expect(normalized.response_id).toBe("42");
    expect(normalized.usage).toEqual({
      inputTokens: 8,
      cachedTokens: 0,
      outputTokens: 2,
      turns: 3,
    });
    expect(normalized.last_user_message).toBe("7");
    expect(normalized.last_assistant_message).toBe("false");
    expect(normalized.pending_cli_transcript).toBe("9");
    expect(normalized.history).toHaveLength(20);
    expect(normalized.history[0]).toMatchObject({
      response_id: "r2",
      timestamp: "9",
      user_preview: "u".repeat(20),
      assistant_preview: "",
      usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 },
      last_user_message: "false",
      last_assistant_message: "5",
    });
  });

  test("preserves JSON-safe pending calls and falls back for circular call objects", () => {
    const circular = { type: null, name: 5, id: 4, input: 8, arguments: false };
    circular.self = circular;
    const anonymous = {};
    anonymous.self = anonymous;
    expect(
      normalizeSessionState({
        pending_tool_calls: [
          null,
          42,
          { type: "function_call", call_id: "safe" },
          circular,
          anonymous,
        ],
      }).pending_tool_calls,
    ).toEqual([
      { type: "function_call", call_id: "safe" },
      {
        type: "function_call",
        name: "5",
        call_id: "4",
        input: "8",
        arguments: "false",
      },
      {
        type: "function_call",
        name: undefined,
        call_id: "",
        input: undefined,
        arguments: undefined,
      },
    ]);
  });

  test("normalizes execution journals and ignores malformed records", () => {
    expect(
      normalizeSessionState({
        execution_journal: [
          null,
          { identity: 42, status: "started", response_id: 7, updated_at: 9 },
          { identity: 8 },
          { identity: "" },
          { identity: null },
        ],
      }).execution_journal,
    ).toEqual([
      { identity: "42", status: "started", response_id: "7", updated_at: "9" },
      { identity: "8", status: "pending", response_id: "", updated_at: "" },
    ]);
    expect(normalizeSessionState({ execution_journal: "bad" }).execution_journal).toEqual([]);
  });

  test("normalizes optional flags and clones object-valued metadata", () => {
    const request = { input: [{ role: "user" }] };
    const transaction = { outputs: [{ call_id: "c1" }] };
    const goal = { text: "finish" };
    const normalized = normalizeSessionState({
      failed_response: 1,
      pending_retry_request: request,
      pending_transaction: transaction,
      goal,
      rollback_backup: [{ response_id: "old", user_preview: "x" }],
    });
    expect(normalized.failed_response).toBe(true);
    expect(normalized.pending_retry_request).toEqual(request);
    expect(normalized.pending_retry_request).not.toBe(request);
    expect(normalized.pending_transaction).toEqual(transaction);
    expect(normalized.pending_transaction).not.toBe(transaction);
    expect(normalized.goal).toEqual(goal);
    expect(normalized.goal).not.toBe(goal);
    expect(normalized.rollback_backup).toEqual([
      {
        response_id: "old",
        timestamp: "",
        user_preview: "x",
        assistant_preview: "",
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
        last_user_message: "",
        last_assistant_message: "",
      },
    ]);
  });

  test("normalizes absent optional values when their persisted keys exist", () => {
    expect(
      normalizeSessionState({
        failed_response: 0,
        pending_retry_request: "invalid",
        pending_transaction: null,
        goal: false,
        history: "bad",
        rollback_backup: "bad",
        execution_journal: [],
      }),
    ).toMatchObject({
      failed_response: false,
      pending_retry_request: null,
      pending_transaction: null,
      goal: null,
      history: [],
      rollback_backup: [],
      execution_journal: [],
    });
  });
});
