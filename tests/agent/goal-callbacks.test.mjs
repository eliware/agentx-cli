import { describe, expect, jest, test } from "@jest/globals";
import { createGoalCallbacks } from "../../src/agent/goal-callbacks.mjs";

function makeCallbacks({
  goal = { status: "active", text: "ship it" },
  readline,
  terminalInput = {},
} = {}) {
  const state = { goal };
  const writes = [];
  const saved = jest.fn();
  const callbacks = createGoalCallbacks({
    getGoal: () => state.goal,
    setGoal: (value) => {
      state.goal = value;
    },
    saveState: saved,
    getReadline: () => readline,
    terminalInput,
    write: (text) => writes.push(text),
    formatMessage: (text) => `<${text}>`,
  });
  return { callbacks, state, writes, saved };
}

describe("goal callbacks", () => {
  test("persists active iterations and ignores iteration updates after the goal stops", async () => {
    const active = makeCallbacks();
    await active.callbacks.onGoalIteration(3);
    expect(active.state.goal).toEqual({ status: "active", text: "ship it", iterations: 3 });
    expect(active.saved).toHaveBeenCalledTimes(1);

    const inactive = makeCallbacks({ goal: { status: "completed" } });
    await inactive.callbacks.onGoalIteration(4);
    expect(inactive.state.goal).toEqual({ status: "completed" });
    expect(inactive.saved).not.toHaveBeenCalled();
  });

  test("records completion result and timestamp", async () => {
    const { callbacks, state, saved } = makeCallbacks();
    await callbacks.onGoalComplete("done");
    expect(state.goal).toMatchObject({ status: "completed", result: "done" });
    expect(new Date(state.goal.completed_at).toISOString()).toBe(state.goal.completed_at);
    expect(saved).toHaveBeenCalledTimes(1);
  });

  test("switches to cooked mode, displays choices, asks readline, and saves the answer context", async () => {
    const readline = { question: jest.fn().mockResolvedValue("B") };
    const terminalInput = { setRawMode: jest.fn() };
    const { callbacks, state, writes, saved } = makeCallbacks({ readline, terminalInput });
    await expect(
      callbacks.onGoalBlocked({ question: "Which?", choices: ["First", "Second"] }),
    ).resolves.toBe("B");
    expect(terminalInput.setRawMode).toHaveBeenCalledWith(false);
    expect(readline.question).toHaveBeenCalledWith("Choose A-D or answer: ");
    expect(writes).toEqual(["<GOAL QUESTION: Which?>\n", "A) First\n", "B) Second\n"]);
    expect(state.goal.last_question).toBe("Which?");
    expect(saved).toHaveBeenCalledTimes(1);
  });

  test("handles missing choices, readline, and optional raw-mode control", async () => {
    const withReadline = makeCallbacks({
      readline: { question: jest.fn().mockResolvedValue("text") },
    });
    await expect(withReadline.callbacks.onGoalBlocked({})).resolves.toBe("text");
    expect(withReadline.writes).toEqual(["<GOAL QUESTION: Input required>\n"]);
    expect(withReadline.state.goal.last_question).toBeUndefined();

    const withoutReadline = makeCallbacks();
    await expect(withoutReadline.callbacks.onGoalBlocked({ question: "Need input" })).resolves.toBe(
      "",
    );
    expect(withoutReadline.saved).toHaveBeenCalledTimes(1);
  });

  test("blocks a goal at its iteration limit and only renders nonempty final responses", async () => {
    const { callbacks, state, writes, saved } = makeCallbacks();
    await callbacks.onGoalLimit(8);
    expect(state.goal).toEqual({ status: "blocked", text: "ship it", iterations: 8 });
    expect(writes).toEqual(["<Goal stopped after 8 iterations>\n"]);
    expect(saved).toHaveBeenCalledTimes(1);

    const render = jest.fn();
    const finalCallbacks = createGoalCallbacks({
      getGoal: () => null,
      setGoal: jest.fn(),
      saveState: jest.fn(),
      getReadline: () => null,
      terminalInput: {},
      printFinalResponse: render,
    });
    await finalCallbacks.onGoalFinalResponse("");
    await finalCallbacks.onGoalFinalResponse("final");
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith("final");
  });

  test("uses default output formatting and final-response output", async () => {
    const writes = [];
    const callbacks = createGoalCallbacks({
      getGoal: () => ({ status: "active" }),
      setGoal: jest.fn(),
      saveState: jest.fn(),
      getReadline: () => null,
      terminalInput: {},
      write: (text) => writes.push(text),
    });
    await callbacks.onGoalLimit(2);
    await callbacks.onGoalFinalResponse("answer");
    expect(writes[0]).toMatch(/Goal stopped after 2 iterations.*\n$/s);
    expect(writes[1]).toBe("answer");
  });
});
