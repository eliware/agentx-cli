import { writeTerminal } from "../terminal-output.mjs";
import { formatInfoMessage, formatMcpMessage } from "../shell-display.mjs";

function formatMcpProgress(event) {
  const progress =
    event?.progress ??
    event?.progress_update ??
    event?.message ??
    event?.data ??
    event?.payload ??
    event?.status ??
    event?.delta;
  if (progress === undefined || progress === null || progress === "") return "";
  return JSON.stringify({ mcp: String(progress) });
}

export function createMcpEventRenderer({
  statusController,
  markOutput,
  write = writeTerminal,
} = {}) {
  return {
    handleEvent(event) {
      const type = String(event.type);
      if (type.endsWith(".in_progress")) {
        statusController?.showExecuting(0, 0);
        return;
      }
      if (type.endsWith(".completed") || type.endsWith(".failed")) {
        statusController?.showReasoning({ renderNow: false });
        return;
      }
      if (type.includes("progress") || type.includes("update")) {
        statusController?.showExecuting(0, 0, { renderNow: false });
        const line = formatMcpProgress(event);
        if (line) write(`${formatInfoMessage(line)}\n`);
      }
    },
    writeArguments(event) {
      markOutput?.();
      const delta = String(event?.delta ?? "");
      if (delta) write(formatMcpMessage(delta));
    },
    addCall(item) {
      markOutput?.();
      statusController?.pause();
      statusController?.beginWriting();
      const label = item.name || item.server_label || "mcp_call";
      write(formatMcpMessage(`${label}(`));
    },
    finishCall() {
      write(formatMcpMessage(")"));
      write("\n");
      // Keep the status line paused until the next response owns the terminal.
      statusController?.resume({ renderNow: false });
      statusController?.pause();
      return "\n";
    },
  };
}
