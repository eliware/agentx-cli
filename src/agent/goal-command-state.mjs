export function transitionGoalCommand(goal, command, timestamp) {
  if (command?.type === "goal_help") {
    return {
      handled: true,
      goal,
      message: "Usage: /goal <text> | /goal status | /goal resume | /goal cancel",
      continue: true,
    };
  }

  if (command?.type === "goal_status") {
    const message =
      goal?.status === "active"
        ? `Active goal: ${goal.text} (iteration ${goal.iterations || 0})`
        : goal?.status === "paused"
          ? `Paused goal: ${goal.text} (iteration ${goal.iterations || 0}); use /goal resume`
          : "No active goal.";
    return { handled: true, goal, message, continue: true };
  }

  if (command?.type === "goal_cancel") {
    return {
      handled: true,
      goal: goal ? { ...goal, status: "cancelled" } : goal,
      message: goal ? "Goal cancelled" : "No active goal.",
      persist: Boolean(goal),
      continue: true,
    };
  }

  if (command?.type === "goal_resume") {
    if (goal?.status !== "paused")
      return { handled: true, goal, message: "No paused goal to resume.", continue: true };
    const resumedGoal = {
      ...goal,
      status: "active",
      resumed_at: timestamp || new Date().toISOString(),
    };
    return {
      handled: true,
      goal: resumedGoal,
      message: `Resuming goal: ${resumedGoal.text}`,
      inputMessage: resumedGoal.text,
      persist: true,
      continue: false,
    };
  }

  if (command?.type === "goal") {
    if (goal?.status === "active")
      return {
        handled: true,
        goal,
        message: "A goal is already active; cancel it first.",
        continue: true,
      };
    if (goal?.status === "paused")
      return {
        handled: true,
        goal,
        message: "A paused goal exists; use /goal resume or /goal cancel first.",
        continue: true,
      };
    const nextGoal = {
      text: command.goal,
      status: "active",
      iterations: 0,
      started_at: timestamp || new Date().toISOString(),
    };
    return {
      handled: true,
      goal: nextGoal,
      message: `Goal started: ${command.goal}`,
      inputMessage: command.goal,
      continue: false,
    };
  }

  return { handled: false, goal };
}
