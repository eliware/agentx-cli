import { applyFirstUserMessage, buildInputMessage } from "./prompt-builder.mjs";

export const WORKER_ROLE_MESSAGE =
  "You are a delegated worker, not the orchestrator. Complete only the task in the user message. Do not spawn agents, orchestrate other work, broaden scope, or wait for further instructions. Inspect, change, and verify only what is needed for this task, then report the result.";

export const GOAL_TOOL_NAMES = new Set(["goal_update", "goal_blocked"]);

export function withGoalTools(template, enabled) {
  const tools = (template?.tools || []).filter((tool) => !GOAL_TOOL_NAMES.has(tool?.name));
  return enabled
    ? {
        ...template,
        tools: [
          ...tools,
          ...(template?.tools || []).filter((tool) => GOAL_TOOL_NAMES.has(tool?.name)),
        ],
        tool_choice: "required",
      }
    : { ...template, tools };
}

export function buildRequestOverride(
  template,
  userMessage,
  agentsText,
  cwd,
  previousResponseId,
  workerRoleMessage = "",
) {
  if (previousResponseId) {
    const input = [buildInputMessage(userMessage)];
    if (workerRoleMessage)
      input.unshift({
        role: "developer",
        content: [{ type: "input_text", text: workerRoleMessage }],
      });
    return {
      ...template,
      input,
      store: true,
      previous_response_id: previousResponseId,
    };
  }

  return {
    ...applyFirstUserMessage(template, userMessage, agentsText, cwd),
    store: true,
  };
}
