import { describe, expect, test } from "@jest/globals";
import { transitionGoalCommand } from "../../src/agent/goal-command-state.mjs";

describe("goal CLI state transitions", () => {
  test("handles help and status without changing state", () => {
    const goal = { text: "finish", status: "active", iterations: 3 };
    expect(transitionGoalCommand(goal, { type: "goal_help" })).toEqual({
      handled: true,
      goal,
      message: "Usage: /goal <text> | /goal status | /goal resume | /goal cancel",
      continue: true,
    });
    expect(transitionGoalCommand(goal, { type: "goal_status" }).message).toBe(
      "Active goal: finish (iteration 3)",
    );
    expect(
      transitionGoalCommand(
        { text: "fresh", status: "active", iterations: 0 },
        { type: "goal_status" },
      ).message,
    ).toBe("Active goal: fresh (iteration 0)");
    expect(transitionGoalCommand(null, { type: "goal_status" }).message).toBe("No active goal.");
    expect(
      transitionGoalCommand({ text: "finish", status: "paused" }, { type: "goal_status" }).message,
    ).toBe("Paused goal: finish (iteration 0); use /goal resume");
  });

  test("cancels an active goal and handles cancellation when none exists", () => {
    const goal = { text: "finish", status: "active" };
    expect(transitionGoalCommand(goal, { type: "goal_cancel" })).toEqual({
      handled: true,
      goal: { ...goal, status: "cancelled" },
      message: "Goal cancelled",
      persist: true,
      continue: true,
    });
    expect(transitionGoalCommand(null, { type: "goal_cancel" })).toMatchObject({
      goal: null,
      message: "No active goal.",
      persist: false,
    });
  });

  test("resumes only paused goals and marks them for persistence", () => {
    expect(transitionGoalCommand({ status: "active" }, { type: "goal_resume" })).toMatchObject({
      message: "No paused goal to resume.",
      continue: true,
    });
    expect(
      transitionGoalCommand(
        { text: "finish", status: "paused", iterations: 2 },
        { type: "goal_resume" },
        "fixed-time",
      ),
    ).toEqual({
      handled: true,
      goal: { text: "finish", status: "active", iterations: 2, resumed_at: "fixed-time" },
      message: "Resuming goal: finish",
      inputMessage: "finish",
      persist: true,
      continue: false,
    });
    expect(
      transitionGoalCommand({ text: "timed", status: "paused" }, { type: "goal_resume" }).goal
        .resumed_at,
    ).toEqual(expect.any(String));
  });

  test("starts goals only when no active or paused goal exists", () => {
    expect(
      transitionGoalCommand({ status: "active" }, { type: "goal", goal: "next" }),
    ).toMatchObject({
      message: "A goal is already active; cancel it first.",
      continue: true,
    });
    expect(
      transitionGoalCommand({ status: "paused" }, { type: "goal", goal: "next" }),
    ).toMatchObject({
      message: "A paused goal exists; use /goal resume or /goal cancel first.",
      continue: true,
    });
    expect(transitionGoalCommand(null, { type: "goal", goal: "finish" }, "fixed-time")).toEqual({
      handled: true,
      goal: { text: "finish", status: "active", iterations: 0, started_at: "fixed-time" },
      message: "Goal started: finish",
      inputMessage: "finish",
      continue: false,
    });
    expect(transitionGoalCommand(null, { type: "goal", goal: "timed" }).goal.started_at).toEqual(
      expect.any(String),
    );
  });

  test("leaves unrelated commands to the runtime coordinator", () => {
    const goal = { status: "active" };
    expect(transitionGoalCommand(goal, { type: "cd" })).toEqual({ handled: false, goal });
    expect(transitionGoalCommand(goal, null)).toEqual({ handled: false, goal });
  });
});
