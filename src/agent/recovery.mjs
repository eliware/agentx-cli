import { getToolCallId } from "./pending-response.mjs";
import { goalCallOutput } from "../agent-turn/goal-call-parser.mjs";
import { buildInterruptedToolOutput } from "./recovery-output.mjs";
export function createResumeToolCallRunner(
  mode,
  pendingCallIds = new Set(),
  uncertainCallIdentities = new Set(),
) {
  return async (call, cwd) => {
    const identity = `id:${getToolCallId(call)}`;
    if (pendingCallIds.has(getToolCallId(call)) || uncertainCallIdentities.has(identity))
      return buildInterruptedToolOutput(call, mode === "auto" ? "request" : mode);
    if (call?.type === "function_call" && call.name === "goal_update") return goalCallOutput(call);
    const { runToolCall } = await import("../tool-dispatch.mjs");
    return await runToolCall(call, cwd, {
      permission: process.env.AGENTX_PERMISSION || "execute",
    });
  };
}
