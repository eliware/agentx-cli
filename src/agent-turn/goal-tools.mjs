const GOAL_TOOLS = new Set(["goal_update", "goal_blocked"]);
const GOAL_METHODS = new Set(["complete", "incomplete", "blocked", "question"]);

export function isGoalToolCall(call) {
  return call?.type === "function_call" && GOAL_TOOLS.has(call.name);
}

function parseGoalArguments(call) {
  try {
    return JSON.parse(call?.arguments ?? call?.input ?? "{}");
  } catch {
    return {};
  }
}

export async function handleGoalToolCall(
  call,
  { goalState, goalIterations, statusController, callbacks },
) {
  const args = parseGoalArguments(call);
  if (call.name === "goal_blocked") {
    statusController?.pause();
    let answer;
    try {
      answer = await callbacks.onGoalBlocked?.(args);
    } finally {
      statusController?.resume({ renderNow: false });
    }
    return answer || "Continue without user input.";
  }

  const method = String(args?.method || "").toLowerCase();
  if (!GOAL_METHODS.has(method))
    return `Invalid goal_update method "${method || "(missing)"}". Use complete, incomplete, or blocked.`;

  if (method === "complete") {
    goalState.finished = true;
    statusController?.pause?.();
    goalState.completionSnapshot = statusController?.snapshot?.() || null;
    await callbacks.onGoalComplete?.(args);
    return "Goal complete acknowledged.";
  }
  if (method === "blocked") {
    await callbacks.onGoalLimit?.(goalIterations);
    goalState.finished = true;
    return "Goal marked blocked.";
  }
  return "Continue working on the goal.";
}
