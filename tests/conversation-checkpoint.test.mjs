import { describe, expect, test } from "@jest/globals";
import { persistCheckpoint, readLatestCheckpoint } from "../src/conversation-checkpoint.mjs";
import { persistResponseState } from "../src/conversation-state.mjs";
import { cleanupTempDir, makeTempDir } from "./test-helpers.mjs";

describe("successful session checkpoints", () => {
  test("falls back to the latest successful history entry and persists a shared checkpoint", async () => {
    const tmp = makeTempDir("agentx-checkpoint-");
    try {
      const checkpoint = `${tmp}/.agentx_checkpoint`;
      const state = `${tmp}/.agentx_responseid`;
      await persistResponseState(state, {
        history: [
          {
            response_id: "resp-history",
            usage: { turns: 2 },
            last_user_message: "u",
            last_assistant_message: "a",
          },
        ],
      });
      await expect(readLatestCheckpoint(checkpoint, state)).resolves.toMatchObject({
        response_id: "resp-history",
        pending_tool_calls: [],
        history: [{ response_id: "resp-history" }],
      });
      await persistCheckpoint(checkpoint, {
        response_id: "resp-checkpoint",
        usage: { turns: 3 },
        last_user_message: "u2",
        last_assistant_message: "a2",
      });
      await expect(readLatestCheckpoint(checkpoint, state)).resolves.toMatchObject({
        response_id: "resp-checkpoint",
        usage: { turns: 3 },
      });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("prefers the last successful checkpoint over interrupted session state", async () => {
    const tmp = makeTempDir("agentx-restart-recovery-");
    try {
      const checkpoint = `${tmp}/.agentx_checkpoint`;
      const state = `${tmp}/.agentx_responseid`;
      await persistResponseState(checkpoint, {
        response_id: "resp-success",
        history: [{ response_id: "resp-success" }],
      });
      await persistResponseState(state, {
        response_id: "resp-interrupted",
        failed_response: true,
        pending_retry_request: { previous_response_id: "resp-interrupted", input: [] },
      });
      await expect(readLatestCheckpoint(checkpoint, state)).resolves.toMatchObject({
        response_id: "resp-success",
      });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("uses a direct checkpoint and handles missing checkpoint and fallback files", async () => {
    const tmp = makeTempDir("agentx-checkpoint-direct-");
    try {
      const checkpoint = `${tmp}/.agentx_checkpoint`;
      await persistResponseState(checkpoint, { response_id: "resp-direct" });
      await expect(readLatestCheckpoint(checkpoint)).resolves.toMatchObject({
        response_id: "resp-direct",
      });
      await expect(readLatestCheckpoint(`${tmp}/missing-checkpoint`)).resolves.toBeNull();
      await expect(
        readLatestCheckpoint(`${tmp}/missing-checkpoint`, `${tmp}/missing-state`),
      ).resolves.toBeNull();
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
