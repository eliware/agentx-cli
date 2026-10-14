const GOAL_TOOLS = new Set(["goal_update", "goal_blocked"]);

export function isGoalToolCall(call) {
  return call?.type === "function_call" && GOAL_TOOLS.has(call.name);
}
