import { describe, expect, test, jest } from "@jest/globals";
import { approveToolCall, declinedToolOutput } from "../../src/agent-turn/tool-call-approval.mjs";

describe("tool call approval", () => {
  test("executes calls without a confirmation requirement", async () => {
    await expect(approveToolCall({ type: "function_call" }, process.cwd(), {}, null)).resolves.toBe(
      true,
    );
  });

  test("executes a destructive call when no confirmation handler exists", async () => {
    await expect(
      approveToolCall(
        { type: "shell_call", action: { commands: ["rm -rf data"] } },
        process.cwd(),
        {},
        null,
      ),
    ).resolves.toBe(true);
  });

  test("pauses status while the confirmer handles a destructive call", async () => {
    const status = { pause: jest.fn(), resume: jest.fn() };
    const streamOptions = { confirmToolCall: jest.fn().mockResolvedValue(false) };
    await expect(
      approveToolCall(
        { type: "shell_call", action: { commands: ["rm -rf data"] } },
        process.cwd(),
        streamOptions,
        status,
      ),
    ).resolves.toBe(false);
    expect(status.pause).toHaveBeenCalled();
    expect(status.resume).toHaveBeenCalledWith({ renderNow: false });
  });

  test("adapts a declined call to a tool output", () => {
    expect(declinedToolOutput({ type: "shell_call", call_id: "c1" })).toMatchObject({
      type: "shell_call_output",
      call_id: "c1",
      status: "incomplete",
    });
    expect(declinedToolOutput({ type: "shell_call", id: "fallback" }).call_id).toBe("fallback");
    expect(declinedToolOutput({ type: "shell_call" }).call_id).toBe("");
  });
});
