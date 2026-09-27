import { describe, expect, jest, test } from "@jest/globals";
import { runSessionRollbackFlow } from "../../src/agent/session-rollback-flow.mjs";

function createFlow({ history = [{ response_id: "saved" }], selected, error } = {}) {
  const order = [];
  const readline = { close: jest.fn(() => order.push("close")) };
  const nextReadline = { question: jest.fn() };
  const preserveHistory = jest.fn(() => order.push("preserve"));
  const promptRollback = jest.fn(async () => {
    order.push("prompt");
    if (error) throw error;
    return selected;
  });
  const applyRollback = jest.fn(() => order.push("apply"));
  const saveState = jest.fn(async () => order.push("save"));
  const persistCheckpoint = jest.fn(async () => order.push("checkpoint"));
  const write = jest.fn((text) => order.push(text));
  const setReadline = jest.fn(() => order.push("restore"));
  const flow = runSessionRollbackFlow({
    history,
    readline,
    preserveHistory,
    promptRollback,
    applyRollback,
    saveState,
    persistCheckpoint,
    checkpointPath: "checkpoint.json",
    input: "stdin",
    output: "stdout",
    write,
    formatMessage: (text) => `[${text}]`,
    createReadline: () => nextReadline,
    setReadline,
  });
  return {
    flow,
    order,
    readline,
    nextReadline,
    preserveHistory,
    promptRollback,
    applyRollback,
    saveState,
    persistCheckpoint,
    write,
    setReadline,
  };
}

describe("session rollback flow", () => {
  test("applies and persists a selected checkpoint before restoring the REPL", async () => {
    const checkpoint = { response_id: "selected" };
    const state = createFlow({ selected: checkpoint });
    await state.flow;
    expect(state.promptRollback).toHaveBeenCalledWith(expect.any(Array), {
      input: "stdin",
      output: "stdout",
    });
    expect(state.applyRollback).toHaveBeenCalledWith(checkpoint);
    expect(state.saveState).toHaveBeenCalledTimes(1);
    expect(state.persistCheckpoint).toHaveBeenCalledWith("checkpoint.json", checkpoint);
    expect(state.write).toHaveBeenCalledWith("[Rolled back to selected]\n");
    expect(state.order.slice(-4)).toEqual([
      "save",
      "checkpoint",
      "[Rolled back to selected]\n",
      "restore",
    ]);
    expect(state.setReadline).toHaveBeenCalledWith(state.nextReadline);
  });

  test("reports an empty checkpoint list when no selection is made", async () => {
    const state = createFlow({ history: [], selected: null });
    await state.flow;
    expect(state.write).toHaveBeenCalledWith("[No successful rollback checkpoints available.]\n");
    expect(state.applyRollback).not.toHaveBeenCalled();
    expect(state.setReadline).toHaveBeenCalledTimes(1);
  });

  test("does not report an empty list when available checkpoints are cancelled", async () => {
    const state = createFlow({ selected: null });
    await state.flow;
    expect(state.write).not.toHaveBeenCalled();
    expect(state.setReadline).toHaveBeenCalledTimes(1);
  });

  test.each([
    [Object.assign(new Error("cancel"), { name: "AbortError" }), false],
    [new Error("menu failed"), true],
  ])("handles menu errors and always restores readline", async (error, reportError) => {
    const state = createFlow({ error });
    await state.flow;
    if (reportError) expect(state.write).toHaveBeenCalledWith("[menu failed]\n");
    else expect(state.write).not.toHaveBeenCalled();
    expect(state.setReadline).toHaveBeenCalledWith(state.nextReadline);
  });

  test("formats thrown values without a message", async () => {
    const state = createFlow({ error: {} });
    await state.flow;
    expect(state.write).toHaveBeenCalledWith("[[object Object]]\n");
  });
});
