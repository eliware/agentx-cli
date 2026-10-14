import { describe, expect, jest, test } from "@jest/globals";
import { prepareSessionInput } from "../../src/agent/session-input.mjs";

describe("session input", () => {
  test.each([
    [true, true],
    [false, false],
  ])("does not prepare terminal input in oneShot=%s, isTTY=%s mode", (oneShot, isTTY) => {
    const terminalInput = { isTTY, setRawMode: jest.fn(), resume: jest.fn() };
    prepareSessionInput({ oneShot, terminalInput });
    expect(terminalInput.setRawMode).not.toHaveBeenCalled();
    expect(terminalInput.resume).not.toHaveBeenCalled();
  });

  test("prepares interactive TTY input", () => {
    const terminalInput = { isTTY: true, setRawMode: jest.fn(), resume: jest.fn() };
    prepareSessionInput({ oneShot: false, terminalInput });
    expect(terminalInput.setRawMode).toHaveBeenCalledWith(true);
    expect(terminalInput.resume).toHaveBeenCalledTimes(1);
  });
});
