const GOAL_METHODS = new Set(["complete", "incomplete", "blocked", "question"]);

export function goalCallOutput(call) {
  return typeof call?.input === "string" ? call.input : call?.arguments || "{}";
}

export function parseGoalCall(call) {
  let args;
  try {
    args = JSON.parse(call?.arguments ?? call?.input ?? "{}");
  } catch {
    args = {};
  }
  if (call?.name === "goal_blocked") return { kind: "question", args };
  const method = String(args?.method || "").toLowerCase();
  return GOAL_METHODS.has(method) ? { kind: "method", args, method } : { kind: "invalid", method };
}
