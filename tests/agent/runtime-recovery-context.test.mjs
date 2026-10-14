import { expect, jest, test } from "@jest/globals";
import { createAgentRecoveryContext } from "../../src/agent/runtime-recovery-context.mjs";
import { recoveryPresentation } from "../../src/agent/recovery-presentation.mjs";
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
  const presentation = {
    writeSystem: jest.fn(),
    writeDebugEnabled: jest.fn(),
  };
  const result = createAgentRecoveryContext({
    input: {},
    repl,
    callbacks,
    applyRollback: jest.fn(),
    resetState: jest.fn(),
    presentation,
  });
  expect(result.terminalInput).toEqual({});
  expect(result.preserveReplHistory).toBe(repl.preserveHistory);
  expect(result.persistCheckpoint).toBe(callbacks.persistCheckpoint);
  expect(result.writeSystem).toBe(presentation.writeSystem);
  expect(result.writeDebugEnabled).toBe(presentation.writeDebugEnabled);
});

test("uses the grouped recovery presentation by default", () => {
  const result = createAgentRecoveryContext({
    callbacks: {},
    repl: {
      preserveHistory: jest.fn(),
      close: jest.fn(),
      createReadline: jest.fn(),
      setReadline: jest.fn(),
    },
  });
  expect(result.writeSystem).toBe(recoveryPresentation.writeSystem);
  expect(result.writeDebugEnabled).toBe(recoveryPresentation.writeDebugEnabled);
});
