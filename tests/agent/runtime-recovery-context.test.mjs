import { expect, jest, test } from "@jest/globals";
import { createAgentRecoveryContext } from "../../src/agent/runtime-recovery-context.mjs";
test("binds recovery actions to the active runtime", () => {
  const repl = {
    preserveHistory: jest.fn(),
    close: jest.fn(),
    createReadline: jest.fn(),
    setReadline: jest.fn(),
  };
  const callbacks = {
    saveState: jest.fn(),
    persistCheckpoint: jest.fn(),
    clearSession: jest.fn(),
    setActiveOpenAI: jest.fn(),
  };
  const result = createAgentRecoveryContext({
    input: {},
    repl,
    callbacks,
    applyRollback: jest.fn(),
    resetState: jest.fn(),
  });
  expect(result.terminalInput).toEqual({});
  expect(result.preserveReplHistory).toBe(repl.preserveHistory);
  expect(result.persistCheckpoint).toBe(callbacks.persistCheckpoint);
});
