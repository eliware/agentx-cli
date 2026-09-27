import { describe, expect, test } from "@jest/globals";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  clearSession,
  persistResponseState,
  readSessionState,
} from "../src/conversation-state.mjs";
import { cleanupTempDir, makeTempDir, makeFile } from "./test-helpers.mjs";

describe("session state", () => {
  test("preserves durable pending transactions", async () => {
    const tmp = await makeTempDir();
    const statePath = path.join(tmp, ".agentx_responseid");
    const transaction = {
      base_response_id: "resp-tool",
      calls: [{ type: "shell_call", call_id: "call-1" }],
      request: { previous_response_id: "resp-tool", input: [{ call_id: "call-1" }] },
      outputs: [{ call_id: "call-1", output: "interrupted" }],
    };
    await persistResponseState(statePath, {
      response_id: "resp-tool",
      pending_transaction: transaction,
    });
    await expect(readSessionState(statePath)).resolves.toMatchObject({
      pending_transaction: transaction,
    });
    cleanupTempDir(tmp);
  });

  test("persists, reads and clears state files", async () => {
    const tmp = makeTempDir("agentx-state-");
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await persistResponseState(statePath, {
        pending_retry_request: { previous_response_id: "resp-tool", input: [] },
        response_id: "resp-1",
        usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 },
        last_user_message: "hello",
        last_assistant_message: "hi",
        pending_cli_transcript: "",
        pending_tool_calls: [
          {
            type: "function_call",
            name: "custom_tool",
            call_id: "call-1",
            arguments: '{"p":[{"s":["echo hi"]}]}',
          },
        ],
      });
      await expect(readSessionState(statePath)).resolves.toEqual({
        pending_retry_request: { previous_response_id: "resp-tool", input: [] },
        response_id: "resp-1",
        usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 },
        last_user_message: "hello",
        last_assistant_message: "hi",
        pending_cli_transcript: "",
        pending_tool_calls: [
          {
            type: "function_call",
            name: "custom_tool",
            call_id: "call-1",
            arguments: '{"p":[{"s":["echo hi"]}]}',
          },
        ],
      });

      await makeFile(tmp, ".agentx_responseid", JSON.stringify({ pending_retry_request: null }));
      await expect(readSessionState(statePath)).resolves.toMatchObject({
        pending_retry_request: null,
      });

      await makeFile(
        tmp,
        ".agentx_responseid",
        JSON.stringify({ response_id: "resp-null-transaction", pending_transaction: null }),
      );
      await expect(readSessionState(statePath)).resolves.toMatchObject({
        response_id: "resp-null-transaction",
        pending_transaction: null,
      });

      await makeFile(
        tmp,
        ".agentx_responseid",
        JSON.stringify({ response_id: "resp-null-goal", goal: null }),
      );
      await expect(readSessionState(statePath)).resolves.toMatchObject({
        response_id: "resp-null-goal",
        goal: null,
      });

      await makeFile(tmp, ".agentx_responseid", "resp-legacy\n");
      await expect(readSessionState(statePath)).resolves.toEqual({
        response_id: "resp-legacy",
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
        last_user_message: "",
        last_assistant_message: "",
        pending_cli_transcript: "",
        pending_tool_calls: [],
      });

      await makeFile(tmp, ".agentx_responseid", "");
      await expect(readSessionState(statePath)).resolves.toBeNull();

      await clearSession(statePath);
      expect(existsSync(statePath)).toBe(false);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("persists empty values when no state is supplied", async () => {
    const tmp = makeTempDir("agentx-state-");
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await persistResponseState(statePath, undefined);
      await expect(readSessionState(statePath)).resolves.toEqual({
        response_id: "",
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
        last_user_message: "",
        last_assistant_message: "",
        pending_cli_transcript: "",
        pending_tool_calls: [],
      });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("cleans temporary state files when the destination rename fails", async () => {
    const tmp = makeTempDir("agentx-state-rename-fails-");
    const statePath = path.join(tmp, ".agentx_responseid");
    try {
      mkdirSync(statePath);
      await expect(
        persistResponseState(statePath, { response_id: "rename-fails" }),
      ).rejects.toBeTruthy();
      expect(
        (await import("node:fs/promises").then(({ readdir }) => readdir(tmp))).filter((name) =>
          name.includes(".tmp"),
        ),
      ).toEqual([]);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("falls back from primitive JSON values", async () => {
    const tmp = makeTempDir("agentx-state-");
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await makeFile(tmp, ".agentx_responseid", "42");
      await expect(readSessionState(statePath)).resolves.toEqual({
        response_id: "42",
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
        last_user_message: "",
        last_assistant_message: "",
        pending_cli_transcript: "",
        pending_tool_calls: [],
      });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("normalizes JSON, legacy text and malformed content", async () => {
    const tmp = makeTempDir("agentx-state-");
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await makeFile(tmp, ".agentx_responseid", '{"response_id":"42"}\n');
      await expect(readSessionState(statePath)).resolves.toEqual({
        response_id: "42",
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
        last_user_message: "",
        last_assistant_message: "",
        pending_cli_transcript: "",
        pending_tool_calls: [],
      });

      await makeFile(tmp, ".agentx_responseid", "not-json");
      await expect(readSessionState(statePath)).resolves.toEqual({
        response_id: "not-json",
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
        last_user_message: "",
        last_assistant_message: "",
        pending_cli_transcript: "",
        pending_tool_calls: [],
      });

      await makeFile(tmp, ".agentx_responseid", "   ");
      await expect(readSessionState(statePath)).resolves.toEqual({
        response_id: "",
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
        last_user_message: "",
        last_assistant_message: "",
        pending_cli_transcript: "",
        pending_tool_calls: [],
      });
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
