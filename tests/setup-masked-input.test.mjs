import { expect, test } from "@jest/globals";
import { EventEmitter } from "node:events";
import { askMasked } from "../src/setup-masked-input.mjs";

class Input extends EventEmitter {
  setRawMode(value) {
    this.raw = value;
  }
  resume() {}
}

test("masks input, edits with backspace, and uses the fallback on Ctrl-C", async () => {
  const input = new Input();
  let output = "";
  const read = askMasked(input, { write: (text) => (output += text) }, "Key: ", "fallback");
  input.emit("data", "a\u0001\b\bkey\r");
  await expect(read).resolves.toBe("key");
  expect(output).toContain("\b \b");
  expect(output).toContain("***");
  expect(input.raw).toBe(false);

  const cancelledInput = new Input();
  const cancelled = askMasked(cancelledInput, { write() {} }, "Key: ", "fallback");
  cancelledInput.emit("data", "\u0003");
  await expect(cancelled).resolves.toBe("fallback");
});

test("returns an empty value when Enter arrives without input", async () => {
  const input = new Input();
  const read = askMasked(input, { write() {} }, "Key: ");
  input.emit("data", "\r");
  await expect(read).resolves.toBe("");
});
