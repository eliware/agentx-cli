import { writeTerminal } from "../terminal-output.mjs";
import { formatSystemMessage } from "../shell-display.mjs";

export function createInteractiveToolCallRunner({
  oneShot,
  terminalInput,
  preserveHistory,
  closeReadline,
  replaceReadline,
  write = writeTerminal,
  formatMessage = formatSystemMessage,
  loadToolCall = () => import("../tool-dispatch.mjs"),
}) {
  return async function runInteractiveToolCall(call, toolCwd, options = {}) {
    const controller = new AbortController();
    const interactive =
      !oneShot &&
      terminalInput?.isTTY &&
      typeof terminalInput?.setRawMode === "function" &&
      typeof terminalInput?.on === "function";
    let interrupted = false;
    const onRawData = (chunk) => {
      if (String(chunk).includes("\x14")) {
        interrupted = true;
        options?.statusController?.pause?.();
        write(`${formatMessage("User interrupted command (Ctrl-T)")}\n`);
        controller.abort();
      }
    };

    if (interactive) {
      preserveHistory();
      closeReadline();
      terminalInput.setRawMode(true);
      terminalInput.on("data", onRawData);
      terminalInput.resume?.();
    }

    try {
      const { runToolCall } = await loadToolCall();
      const output = await runToolCall(call, toolCwd, {
        ...options,
        permission: options.permission || process.env.AGENTX_PERMISSION || "execute",
        signal: controller.signal,
      });
      if (interrupted && output?.type === "shell_call_output") {
        const first = output.output?.[0];
        if (first) {
          first.stderr = `${first.stderr || ""}${first.stderr ? "\n" : ""}The user requested interruption (Ctrl-T). Stop executing and do not retry or run additional commands. Return the current status to the user.`;
        }
      }
      return output;
    } finally {
      if (interactive) {
        terminalInput.removeListener?.("data", onRawData);
        terminalInput.setRawMode(false);
        replaceReadline();
      }
    }
  };
}
