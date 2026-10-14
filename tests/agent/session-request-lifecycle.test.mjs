import { expect, jest, test } from "@jest/globals";
import { runWithSessionRequestLifecycle } from "../../src/agent/session-request-lifecycle.mjs";

function createContext(goalStatus) {
  return {
    oneShot: false,
    terminalInput: "input",
    getGoal: () => ({ status: goalStatus }),
    setGoal: jest.fn(),
    saveState: jest.fn(),
    replaceReplInterface: jest.fn(),
  };
}

test("cleans up the listener and refreshes the goal REPL after an attempt", async () => {
  const context = createContext("active");
  const detach = jest.fn();
  const attempt = jest.fn(async () => "response");
  await expect(
    runWithSessionRequestLifecycle({ context, attachListener: jest.fn(() => detach), attempt }),
  ).resolves.toBe("response");
  expect(detach).toHaveBeenCalledTimes(1);
  expect(context.replaceReplInterface).toHaveBeenCalledTimes(1);
});

test("cleans up the listener after failure without refreshing an inactive goal", async () => {
  const context = createContext("completed");
  const detach = jest.fn();
  const error = new Error("request failed");
  await expect(
    runWithSessionRequestLifecycle({
      context,
      attachListener: jest.fn(() => detach),
      attempt: async () => {
        throw error;
      },
    }),
  ).rejects.toBe(error);
  expect(detach).toHaveBeenCalledTimes(1);
  expect(context.replaceReplInterface).not.toHaveBeenCalled();
});
