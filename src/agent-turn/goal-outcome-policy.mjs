export function selectGoalOutcome(parsed, goalIterations) {
  if (parsed.kind === "question") return { action: "ask", args: parsed.args };
  if (parsed.kind === "invalid")
    return {
      action: "reply",
      output: `Invalid goal_update method "${parsed.method || "(missing)"}". Use complete, incomplete, or blocked.`,
    };
  if (parsed.method === "complete") return { action: "complete", args: parsed.args };
  if (parsed.method === "blocked") return { action: "blocked", iterations: goalIterations };
  return { action: "reply", output: "Continue working on the goal." };
}
