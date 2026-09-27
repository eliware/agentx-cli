import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { EventEmitter } from "node:events";
import { askMasked, selectSetupMenu } from "../src/setup-menu.mjs";

class Terminal extends EventEmitter {
  setRawMode(value) {
    this.raw = value;
  }
  resume() {
    this.resumed = true;
  }
}

class Output {
  text = "";
  write(value) {
    this.text += value;
  }
}

const send = (input, text) => setImmediate(() => input.emit("data", Buffer.from(text)));

describe("setup terminal menu", () => {
  let originalStdoutWrite;
  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
  });
  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  test("masks user input, handles backspace, and supports cancellation fallback", async () => {
    const input = new Terminal();
    const output = new Output();
    const cancelled = askMasked(input, output, "Key: ", "fallback");
    send(input, "\u0003");
    await expect(cancelled).resolves.toBe("fallback");

    const editedInput = new Terminal();
    const edited = askMasked(editedInput, output, "Key: ");
    send(editedInput, "a\u0001\b\bkey\r");
    await expect(edited).resolves.toBe("key");
    expect(output.text).toContain("\b \b");
    expect(output.text).toContain("***");
    expect(editedInput.raw).toBe(false);

    const emptyInput = new Terminal();
    const empty = askMasked(emptyInput, output, "Key: ");
    send(emptyInput, "\r");
    await expect(empty).resolves.toBe("");
  });

  test("returns null when raw keyboard input is unavailable", async () => {
    await expect(selectSetupMenu({}, new Output(), [{ id: "one", label: "One" }])).resolves.toBe(
      null,
    );
  });

  test("navigates with arrows and accepts the selected entry with Enter", async () => {
    const input = new Terminal();
    const output = new Output();
    const entries = [
      { id: "one", label: "One" },
      { id: "two", label: "Two" },
    ];
    const pending = selectSetupMenu(input, output, entries, 9, { envPath: "/tmp/config" });
    send(input, "\u001b[B");
    await new Promise((resolve) => setImmediate(resolve));
    send(input, "\u001b[A");
    await new Promise((resolve) => setImmediate(resolve));
    send(input, "\u001b[B");
    await new Promise((resolve) => setImmediate(resolve));
    send(input, "\r");
    await expect(pending).resolves.toBe(entries[1]);
    expect(output.text).toContain("Config File: /tmp/config");
    expect(input.raw).toBe(false);
  });

  test("selects a numbered entry and returns the quit entry on Ctrl-C", async () => {
    const entries = [
      { id: "one", label: "One" },
      { id: "quit", label: "Quit" },
    ];
    const numbered = new Terminal();
    const selected = selectSetupMenu(numbered, new Output(), entries);
    send(numbered, "2");
    await expect(selected).resolves.toBe(entries[1]);

    const cancelled = new Terminal();
    const cancelledResult = selectSetupMenu(cancelled, new Output(), entries);
    send(cancelled, "\u0003");
    await expect(cancelledResult).resolves.toBe(entries[1]);
  });

  test("trims excess input and uses fallback screen paths", async () => {
    const input = new Terminal();
    const output = new Output();
    const entries = [{ id: "one", label: "One" }];
    const pending = selectSetupMenu(input, output, entries, 0, { rootDir: "/tmp/root" });
    send(input, "123456789");
    await new Promise((resolve) => setImmediate(resolve));
    send(input, "\r");
    await expect(pending).resolves.toBe(entries[0]);
    expect(output.text).toContain("Install Path: /tmp/root");
    expect(output.text).toContain("MCP Config:");

    const shortInput = new Terminal();
    const shortResult = selectSetupMenu(shortInput, new Output(), entries);
    send(shortInput, "x");
    await new Promise((resolve) => setImmediate(resolve));
    send(shortInput, "\r");
    await expect(shortResult).resolves.toBe(entries[0]);
  });
});
