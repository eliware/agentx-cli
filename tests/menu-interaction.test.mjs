import { expect, jest, test } from "@jest/globals";
import { EventEmitter } from "node:events";
import { runMenuInteraction } from "../src/menu-interaction.mjs";

test("starts menu input and restores terminal state after selection", async () => {
  const input = new EventEmitter();
  input.setRawMode = jest.fn();
  input.resume = jest.fn();
  const output = { write: jest.fn() };
  const clear = jest.fn();
  const render = jest.fn();
  const pending = runMenuInteraction({
    input,
    output,
    clear,
    render,
    onKeypress: (_str, _key, { finish }) => finish("selected"),
  });
  input.emit("keypress", "", {});
  await expect(pending).resolves.toBe("selected");
  expect(input.setRawMode.mock.calls).toEqual([[true], [false]]);
  expect(clear).toHaveBeenCalledTimes(1);
  expect(output.write).toHaveBeenCalledWith("\x1b[?25h");
});

test("cleans the terminal when a key handler throws by rejection", async () => {
  const input = new EventEmitter();
  input.setRawMode = jest.fn();
  const output = { write: jest.fn() };
  const pending = runMenuInteraction({
    input,
    output,
    clear() {},
    render() {},
    onKeypress: (_str, _key, { fail }) => fail(new Error("failed")),
  });
  input.emit("keypress", "", {});
  await expect(pending).rejects.toThrow("failed");
  expect(input.setRawMode).toHaveBeenLastCalledWith(false);
});
