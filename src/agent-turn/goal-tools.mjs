const GOAL_TOOLS = new Set(["goal_update", "goal_blocked"]);
const GOAL_METHODS = new Set(["complete", "incomplete", "blocked", "question"]);

export function isGoalToolCall(call) {
  return call?.type === "function_call" && GOAL_TOOLS.has(call.name);
}

export function parseGoalToolCall(call, { goalIterations } = {}) {
  let args;
  try {
    args = JSON.parse(call?.arguments ?? call?.input ?? "{}");
  } catch {
    args = {};
  }
  if (call?.name === "goal_blocked") return { action: "ask", args };
  const method = String(args?.method || "").toLowerCase();
  if (!GOAL_METHODS.has(method))
    return {
      action: "reply",
      output: `Invalid goal_update method "${method || "(missing)"}". Use complete, incomplete, or blocked.`,
    };
  if (method === "complete") return { action: "complete", args };
  if (method === "blocked") return { action: "blocked", iterations: goalIterations };
  return { action: "reply", output: "Continue working on the goal." };
}
