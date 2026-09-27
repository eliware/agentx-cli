import { runShellCommands } from "./tool-shell-sequence.mjs";
import { runParallelWorkerFunction } from "./parallel-workers.mjs";
import { commandPermission, permissionAllows } from "./tool-permissions.mjs";

function parseShellActionCommands(call) {
  const commands = call?.action?.commands;
  return Array.isArray(commands) || typeof commands === "string" ? commands : [];
}

export async function runToolCall(call, cwd, options = {}) {
  if (!call || typeof call !== "object" || Array.isArray(call)) return "ERROR: invalid tool call";
  if (typeof cwd !== "string" || !cwd.trim())
    return `ERROR: invalid working directory for ${call.type || "tool"}`;
  if (
    call?.type === "function_call" &&
    ["spawn_agent", "agent_status", "cancel_agent"].includes(call?.name)
  ) {
    return await runParallelWorkerFunction(call, cwd, {
      ...options,
      permission: options.permission || process.env.AGENTX_PERMISSION || "execute",
    });
  }
  if (call?.type === "function_call" && call?.name === "goal_update")
    return typeof call.input === "string" ? call.input : call.arguments || "{}";

  if (call?.type === "shell_call") {
    const permission = options?.permission || process.env.AGENTX_PERMISSION || "execute";
    if (!permissionAllows(permission, call)) {
      return {
        type: "shell_call_output",
        call_id: call?.call_id || call?.id || "",
        status: "incomplete",
        output: [
          {
            stdout: "",
            stderr: `Command blocked: worker permission '${permission}' does not allow ${commandPermission(call)} operations.`,
            outcome: { type: "exit", exit_code: 126 },
          },
        ],
      };
    }
    return await runShellCommands(parseShellActionCommands(call), cwd, {
      timeoutMs: call?.action?.timeout_ms,
      maxOutputLength: call?.action?.max_output_length,
      callId: call?.call_id || call?.id || "",
      signal: options?.signal,
    });
  }

  return `ERROR: unsupported tool ${call?.name || call?.type}`;
}
