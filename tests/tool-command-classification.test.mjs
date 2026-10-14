import { describe, expect, test } from "@jest/globals";
import { commandPermission } from "../src/tool-command-classification.mjs";

describe("tool permission and confirmation policy", () => {
  test("classifies shell commands", () => {
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
    }
  });
});
