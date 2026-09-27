import { describe, expect, jest, test } from "@jest/globals";
import { PassThrough } from "node:stream";
import { createSessionRepl } from "../../src/agent/session-repl.mjs";

describe("session REPL lifecycle", () => {
  test("creates interactive readline, preserves history, and replaces the interface", () => {
    const cwd = jest.fn(() => "C:/repo");
    const input = {};
    const output = {};
    const interfaces = [];
    const createInterface = jest.fn((...args) => {
      const instance = { history: [], close: jest.fn() };
      interfaces.push({ instance, args });
      return instance;
    });
    const repl = createSessionRepl({ oneShot: false, getCwd: cwd, input, output, createInterface });

    expect(repl.getReadline()).toBe(interfaces[0].instance);
    expect(interfaces[0].args).toEqual([cwd, input, output, []]);
    interfaces[0].instance.history.push("previous");
    repl.preserveHistory();
    interfaces[0].instance.history.push("later");
    repl.replace();

    expect(interfaces[0].instance.close).toHaveBeenCalledTimes(1);
    expect(interfaces[1].args[3]).toEqual(["previous", "later"]);
    expect(repl.getReadline()).toBe(interfaces[1].instance);
    const replacement = { history: ["manual"] };
    repl.setReadline(replacement);
    expect(repl.getReadline()).toBe(replacement);
    repl.close();
    expect(replacement.close).toBeUndefined();
  });

  test("one-shot sessions have no readline and tolerate missing history and close methods", () => {
    const createInterface = jest.fn();
    const repl = createSessionRepl({
      oneShot: true,
      getCwd: () => ".",
      input: null,
      output: null,
      createInterface,
    });
    expect(repl.getReadline()).toBeNull();
    expect(createInterface).not.toHaveBeenCalled();
    expect(repl.preserveHistory()).toBeUndefined();
    expect(repl.close()).toBeUndefined();
  });

  test("does not preserve malformed history values", () => {
    const current = { history: "not-an-array" };
    const repl = createSessionRepl({
      oneShot: true,
      getCwd: () => ".",
      input: null,
      output: null,
      createInterface: () => current,
    });
    repl.setReadline(current);
    repl.preserveHistory();
    expect(repl.getReadline()).toBe(current);
    repl.setReadline(null);
    expect(repl.getReadline()).toBeNull();
    expect(repl.close()).toBeUndefined();
  });

  test("creates a replacement readline for one-shot sessions when requested", () => {
    const createInterface = jest.fn(() => ({ history: ["seed"] }));
    const repl = createSessionRepl({
      oneShot: true,
      getCwd: () => ".",
      input: null,
      output: null,
      createInterface,
    });
    expect(repl.createReadline()).toEqual({ history: ["seed"] });
    expect(createInterface).toHaveBeenCalledWith(expect.any(Function), null, null, []);
  });

  test("uses the standard readline factory when no adapter is provided", () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const repl = createSessionRepl({
      oneShot: false,
      getCwd: () => ".",
      input,
      output,
    });
    expect(repl.getReadline()).toBeDefined();
    repl.close();
    input.destroy();
    output.destroy();
  });
});
