import { writeTerminal } from "../terminal-output.mjs";
import { formatCommandMessage, formatCustomToolMessage } from "../shell-display.mjs";

export function createToolEventRenderer(write = writeTerminal) {
  return {
    writeDelta(event) {
      const delta = String(event?.delta ?? "");
      if (!delta) return "";

      const formatted =
        event?.type === "response.shell_call_command.delta"
          ? formatCommandMessage(delta)
          : formatCustomToolMessage(delta);
      write(formatted);
      return delta;
    },
    finishItem() {
      write("\n");
      return "\n";
    },
  };
}
