import { describe, expect, jest, test } from "@jest/globals";
import { runSessionSetupFlow } from "../../src/agent/session-setup-flow.mjs";

function createFlow({ setupError } = {}) {
  const order = [];
  const readline = { close: jest.fn(() => order.push("close")) };
  const preserveHistory = jest.fn(() => order.push("preserve"));
  const runSetup = jest.fn(async () => {
    order.push("setup");
    if (setupError) throw setupError;
  });
  const reloadTemplate = jest.fn(async () => {
    order.push("reload");
    return { model: "reloaded" };
  });
  const write = jest.fn((text) => order.push(text));
  const printError = jest.fn((text) => order.push(text));
  const createReadline = jest.fn(() => {
    order.push("create-readline");
    return { question: jest.fn() };
  });
  return {
    order,
    readline,
    preserveHistory,
    runSetup,
    reloadTemplate,
    write,
    printError,
    createReadline,
    run: () =>
      runSessionSetupFlow({
        readline,
        preserveHistory,
        runSetup,
        reloadTemplate,
        write,
        printError,
        formatMessage: (text) => `[${text}]`,
        createReadline,
        setReadline: jest.fn((next) => order.push(next === null ? "set-null" : "set-readline")),
        input: "stdin",
        output: "stdout",
      }),
  };
}

describe("session setup flow", () => {
  test("closes the current REPL, reloads settings, and opens a replacement", async () => {
    const flow = createFlow();
    await expect(flow.run()).resolves.toEqual({ model: "reloaded" });
    expect(flow.preserveHistory).toHaveBeenCalledTimes(1);
    expect(flow.readline.close).toHaveBeenCalledTimes(1);
    expect(flow.runSetup).toHaveBeenCalledWith({ stdin: "stdin", stdout: "stdout" });
    expect(flow.order).toEqual([
      "preserve",
      "close",
      "setup",
      "reload",
      "[Settings reloaded]\n",
      "create-readline",
      "set-readline",
    ]);
  });

  test("reports setup errors, then reloads settings and restores the REPL", async () => {
    const flow = createFlow({ setupError: new Error("setup failed") });
    await expect(flow.run()).resolves.toEqual({ model: "reloaded" });
    expect(flow.printError).toHaveBeenCalledWith("Error during setup: setup failed");
    expect(flow.order).toContain("reload");
    expect(flow.order.at(-1)).toBe("set-readline");
  });

  test("formats non-Error setup failures", async () => {
    const flow = createFlow({ setupError: "failure" });
    await flow.run();
    expect(flow.printError).toHaveBeenCalledWith("Error during setup: failure");
  });
});
