import { describe, expect, test } from "@jest/globals";
import { runToolCall } from "../src/tool-dispatch.mjs";
import { cleanupTempDir, makeTempDir } from "./test-helpers.mjs";

describe("tool dispatch", () => {
  test("passes goal-update payloads through without interpreting lifecycle policy", async () => {
    const complete = JSON.stringify({ method: "complete", summary: "done" });
    const incomplete = JSON.stringify({ method: "incomplete" });
    await expect(
      runToolCall({ type: "function_call", name: "goal_update", arguments: complete }, "/tmp"),
    ).resolves.toBe(complete);
    await expect(
      runToolCall({ type: "function_call", name: "goal_update", input: incomplete }, "/tmp"),
    ).resolves.toBe(incomplete);
    await expect(runToolCall({ type: "function_call", name: "goal_update" }, "/tmp")).resolves.toBe(
      "{}",
    );
  });

  test("validates calls and working directories before side effects", async () => {
    expect(await runToolCall(null, process.cwd())).toBe("ERROR: invalid tool call");
    expect(await runToolCall([], process.cwd())).toBe("ERROR: invalid tool call");
    expect(await runToolCall({ type: "shell_call" }, "")).toBe(
      "ERROR: invalid working directory for shell_call",
    );
    expect(await runToolCall({}, "")).toBe("ERROR: invalid working directory for tool");
  });

  test("routes goal updates without shell execution", async () => {
    await expect(
      runToolCall({ type: "function_call", name: "goal_update", input: "complete" }, process.cwd()),
    ).resolves.toBe("complete");
    await expect(
      runToolCall({ type: "function_call", name: "goal_update", arguments: "{}" }, process.cwd()),
    ).resolves.toBe("{}");
    await expect(
      runToolCall({ type: "function_call", name: "goal_update" }, process.cwd()),
    ).resolves.toBe("{}");
  });

  test("routes worker operations and preserves passed permissions", async () => {
    const cwd = makeTempDir("agentx-worker-dispatch-");
    try {
      await expect(
        runToolCall(
          {
            type: "function_call",
            name: "cancel_agent",
            arguments: JSON.stringify({ agent_ids: ["missing-agent"] }),
          },
          cwd,
          { permission: "read" },
        ),
      ).resolves.toEqual({ agents: [{ id: "missing-agent", status: "unknown" }] });
      await expect(
        runToolCall(
          {
            type: "function_call",
            name: "agent_status",
            arguments: JSON.stringify({ agent_ids: ["missing-agent"] }),
          },
          cwd,
        ),
      ).resolves.toEqual({
        agents: [{ id: "missing-agent", status: "unknown" }],
        waited_ms: 0,
        timed_out: false,
      });
    } finally {
      cleanupTempDir(cwd);
    }
  });

  test("dispatches shell execution, normalizes command shapes, and enforces permissions", async () => {
    const cwd = makeTempDir("agentx-dispatch-");
    try {
      const output = await runToolCall(
        {
          type: "shell_call",
          call_id: "call-1",
          action: { commands: ["node -e \"process.stdout.write('ok')\""] },
        },
        cwd,
      );
      expect(output).toMatchObject({
        call_id: "call-1",
        status: "completed",
        type: "shell_call_output",
        output: [{ stdout: "ok", stderr: "", outcome: { type: "exit", exit_code: 0 } }],
      });
      await expect(
        runToolCall(
          {
            type: "shell_call",
            action: { commands: "node -e \"process.stdout.write('text-command')\"" },
          },
          cwd,
        ),
      ).resolves.toMatchObject({
        type: "shell_call_output",
        output: [{ stdout: "text-command", outcome: { exit_code: 0 } }],
      });
      await expect(
        runToolCall({ type: "shell_call", call_id: "empty", action: {} }, cwd),
      ).resolves.toMatchObject({ type: "shell_call_output", call_id: "empty", output: [] });
      await expect(
        runToolCall(
          { type: "shell_call", call_id: "blocked", action: { commands: ["touch blocked"] } },
          cwd,
          { permission: "read" },
        ),
      ).resolves.toMatchObject({
        type: "shell_call_output",
        call_id: "blocked",
        status: "incomplete",
        output: [{ outcome: { exit_code: 126 } }],
      });
      await expect(
        runToolCall({ type: "shell_call", action: { commands: ["touch blocked"] } }, cwd, {
          permission: "read",
        }),
      ).resolves.toMatchObject({
        type: "shell_call_output",
        call_id: "",
        status: "incomplete",
      });
    } finally {
      cleanupTempDir(cwd);
    }
  });

  test("returns a concise error for unsupported tool calls", async () => {
    expect(await runToolCall({ type: "weird" }, process.cwd())).toBe(
      "ERROR: unsupported tool weird",
    );
    expect(await runToolCall({ name: "unknown", arguments: "{}" }, process.cwd())).toBe(
      "ERROR: unsupported tool unknown",
    );
  });
});
