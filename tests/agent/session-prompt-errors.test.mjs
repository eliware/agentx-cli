import { describe, expect, jest, test } from "@jest/globals";
import { handleSessionPromptError } from "../../src/agent/session-prompt-errors.mjs";

function dependencies(goal) {
  let currentGoal = goal;
  return {
    getGoal: () => currentGoal,
    setGoal: (value) => {
      currentGoal = value;
    },
    currentGoal: () => currentGoal,
    saveState: jest.fn(async () => {}),
    write: jest.fn(),
    formatMessage: (message) => `[${message}]`,
    exitWithSummary: jest.fn(async () => {}),
  };
}

describe("session prompt errors", () => {
  test.each([
    [Object.assign(new Error("aborted"), { name: "AbortError" })],
    [Object.assign(new Error("aborted"), { code: "ABORT_ERR" })],
  ])("continues after cancelling an active goal on abort", async (error) => {
    const deps = dependencies({ status: "active", text: "goal" });
    await expect(handleSessionPromptError(error, deps)).resolves.toBe("continue");
    expect(deps.currentGoal()).toMatchObject({ status: "cancelled", text: "goal" });
    expect(deps.currentGoal().cancelled_at).toEqual(expect.any(String));
    expect(deps.saveState).toHaveBeenCalledTimes(1);
    expect(deps.write).toHaveBeenCalledWith("[Goal cancelled]\n");
    expect(deps.exitWithSummary).not.toHaveBeenCalled();
  });

  test("exits with a summary when the prompt aborts without an active goal", async () => {
    const deps = dependencies(null);
    await expect(
      handleSessionPromptError(Object.assign(new Error(), { name: "AbortError" }), deps),
    ).resolves.toBe("return");
    expect(deps.exitWithSummary).toHaveBeenCalledWith({ leadingNewline: true });
  });

  test("propagates unexpected input errors", async () => {
    const deps = dependencies(null);
    const error = new Error("readline failed");
    await expect(handleSessionPromptError(error, deps)).rejects.toBe(error);
    expect(deps.exitWithSummary).not.toHaveBeenCalled();
  });
});
