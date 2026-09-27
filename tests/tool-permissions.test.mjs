import { describe, expect, test } from "@jest/globals";
import {
  commandPermission,
  permissionAllows,
  requiresDestructiveConfirmation,
  requiresToolConfirmation,
} from "../src/tool-permissions.mjs";

describe("tool permission and confirmation policy", () => {
  test("classifies shell commands and applies permission levels", () => {
    expect(commandPermission({ type: "function_call" })).toBe("execute");
    expect(commandPermission({ type: "shell_call" })).toBe("read");
    expect(commandPermission({ type: "shell_call", action: { commands: 5 } })).toBe("read");
    expect(commandPermission({ type: "shell_call", action: { commands: "cat file" } })).toBe(
      "read",
    );
    expect(commandPermission({ type: "shell_call", action: { commands: [null] } })).toBe("read");
    expect(commandPermission({ type: "shell_call", action: { commands: ["cat file"] } })).toBe(
      "read",
    );
    expect(commandPermission({ type: "shell_call", action: { commands: ["touch file"] } })).toBe(
      "write",
    );
    expect(commandPermission({ type: "shell_call", action: { commands: ["node app.js"] } })).toBe(
      "execute",
    );
    expect(
      commandPermission({ type: "shell_call", action: { commands: ["echo hi > file"] } }),
    ).toBe("write");
    expect(commandPermission({ type: "shell_call", action: { commands: ["sed x -i file"] } })).toBe(
      "write",
    );
    expect(
      permissionAllows("invalid", { type: "shell_call", action: { commands: ["cat x"] } }),
    ).toBe(true);
    expect(
      permissionAllows("read", { type: "shell_call", action: { commands: ["touch x"] } }),
    ).toBe(false);
    expect(
      permissionAllows("write", { type: "shell_call", action: { commands: ["touch x"] } }),
    ).toBe(true);
    expect(
      permissionAllows("write", { type: "shell_call", action: { commands: ["node x"] } }),
    ).toBe(false);
  });

  test("distinguishes opt-in confirmations from destructive commands", () => {
    expect(
      requiresToolConfirmation({ type: "shell_call", action: { commands: ["rm file"] } }),
    ).toBe(true);
    expect(
      requiresToolConfirmation({ type: "shell_call", action: { commands: ["apt install nginx"] } }),
    ).toBe(false);
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
        action: { commands: ["git reset --hard"] },
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

  test("treats wrappers, substitutions, and encoded execution as execute-level", () => {
    for (const command of [
      'bash -c "touch file"',
      "echo $(touch file)",
      "base64 -d x | sh",
      "cat file | node script.js",
    ]) {
      const call = { type: "shell_call", action: { commands: [command] } };
      expect(commandPermission(call)).toBe("execute");
      expect(permissionAllows("read", call)).toBe(false);
    }
  });
});
