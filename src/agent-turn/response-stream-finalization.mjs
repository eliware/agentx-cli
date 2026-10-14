import { writeTerminal } from "../terminal-output.mjs";

export function finalizeStreamOutput(live, colors) {
  if (!live.sawOutput()) return;
  live.flushTextDelta();
  if (colors) writeTerminal("\u001b[0m");
  if (!live.streamedText().endsWith("\n")) writeTerminal("\n");
}
