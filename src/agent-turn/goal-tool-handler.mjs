import { parseGoalToolCall } from "./goal-tools.mjs";

export async function handleGoalToolCall(call, context) {
  const result = parseGoalToolCall(call, context);
  if (result.action === "ask") {
    context.statusController?.pause();
    let answer;
    try {
      answer = await context.callbacks.onGoalBlocked?.(result.args);
    } finally {
      context.statusController?.resume({ renderNow: false });
    }
    return answer || "Continue without user input.";
  }
  if (result.action === "complete") {
    context.goalState.finished = true;
    context.statusController?.pause?.();
    context.goalState.completionSnapshot = context.statusController?.snapshot?.() || null;
    await context.callbacks.onGoalComplete?.(result.args);
    return "Goal complete acknowledged.";
  }
  if (result.action === "blocked") {
    await context.callbacks.onGoalLimit?.(result.iterations);
    context.goalState.finished = true;
    return "Goal marked blocked.";
  }
  return result.output;
}
