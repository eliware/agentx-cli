import { toolOutputForCall } from "../tool-output-adapter.mjs";
import { requiresDestructiveConfirmation, requiresToolConfirmation } from "../tool-permissions.mjs";

export async function approveToolCall(call, cwd, streamOptions, statusController) {
  if (
    streamOptions.yolo ||
    (!requiresDestructiveConfirmation(call) && !requiresToolConfirmation(call)) ||
    !streamOptions.confirmToolCall
  )
    return true;
  statusController?.pause();
  try {
    return await streamOptions.confirmToolCall(call, cwd);
  } finally {
    statusController?.resume({ renderNow: false });
  }
}

export function declinedToolOutput(call) {
  return toolOutputForCall(call, {
    type: "shell_call_output",
    call_id: call.call_id || call.id || "",
    status: "incomplete",
    output: [
      {
        stdout: "",
        stderr: "Tool execution declined by user.",
        outcome: { type: "exit", exit_code: 1 },
      },
    ],
  });
}
