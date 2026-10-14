import { describe, expect, jest, test } from "@jest/globals";
import { handleRecoveryMenuAbort } from "../../src/agent/recovery-menu-abort.mjs";

describe("recovery menu abort", () => {
  test("restores the prompt after an abort", () => {
    const deps = {
      terminalInput: { setRawMode: jest.fn(), resume: jest.fn() },
      preserveReplHistory: jest.fn(),
      closeReadline: jest.fn(),
      createReadline: jest.fn(() => "readline"),
      setReadline: jest.fn(),
      writeSystem: jest.fn(),
    };
    expect(handleRecoveryMenuAbort({ name: "AbortError" }, deps)).toEqual({ control: "end" });
    expect(deps.setReadline).toHaveBeenCalledWith("readline");
    expect(deps.writeSystem).toHaveBeenCalledWith("Recovery cancelled; session preserved.");
  });

  test("does not handle another error", () => {
    expect(handleRecoveryMenuAbort(new Error("failure"), {})).toBeNull();
  });

  test("handles an abort without optional terminal methods", () => {
    const deps = {
      terminalInput: {},
      preserveReplHistory: jest.fn(),
      closeReadline: jest.fn(),
      createReadline: jest.fn(),
      setReadline: jest.fn(),
      writeSystem: jest.fn(),
    };
    expect(handleRecoveryMenuAbort({ name: "AbortError" }, deps)).toEqual({ control: "end" });
  });
});
