import { expect, test } from "@jest/globals";
import { createRuntimePromptContext } from "../../src/agent/runtime-prompt-context.mjs";

test("binds prompt state to the active runtime", () => {
  const runtimeState = { activeGoal: null, pendingCliTranscript: "" };
  const context = createRuntimePromptContext({ runtimeState, oneShot: true, cwd: "/repo" });
  expect(context.getActiveGoal()).toBeNull();
  expect(context.getPendingCliTranscript()).toBe("");
  context.setActiveGoal({ status: "active" });
  context.setPendingCliTranscript("command output");
  expect(runtimeState).toEqual({
    activeGoal: { status: "active" },
    pendingCliTranscript: "command output",
  });
  expect(context).toMatchObject({ oneShot: true, cwd: "/repo" });
});
