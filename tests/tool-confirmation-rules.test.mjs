import { describe, expect, test } from "@jest/globals";
import {
  requiresDestructiveConfirmation,
  requiresToolConfirmation,
} from "../src/tool-confirmation-rules.mjs";

describe("tool confirmation rules", () => {
  test("prompts for selected operations and destructive commands", () => {
    expect(
      requiresToolConfirmation({ type: "shell_call", action: { commands: ["rm file"] } }),
    ).toBe(true);
    expect(
      requiresToolConfirmation({ type: "shell_call", action: { commands: ["apt install nginx"] } }),
    ).toBe(false);
    expect(requiresToolConfirmation({ type: "shell_call", action: { commands: "rm file" } })).toBe(
      true,
    );
    expect(requiresToolConfirmation({ type: "shell_call" })).toBe(false);
    expect(requiresToolConfirmation({ type: "function_call", name: "shutdown" })).toBe(false);
    expect(
      requiresDestructiveConfirmation({
        type: "shell_call",
        action: { commands: ["rm -rf /tmp/x"] },
      }),
    ).toBe(true);
    expect(
      requiresDestructiveConfirmation({
        type: "shell_call",
        action: { commands: "git reset --hard" },
      }),
    ).toBe(true);
    expect(
      requiresDestructiveConfirmation({
        type: "shell_call",
        action: { commands: ["printf safe"] },
      }),
    ).toBe(false);
    expect(requiresDestructiveConfirmation({ type: "function_call", name: "rm" })).toBe(false);
  });
});
