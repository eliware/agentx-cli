import { writeTerminal } from "../terminal-output.mjs";

const LIME = "\u001b[38;5;230m";
const UNDERLINE = "\u001b[4m";
const UNDERLINE_OFF = "\u001b[24m";
const RESET = "\u001b[0m";

const colorize = (text) => `${LIME}${text}${RESET}`;

export function createReasoningSummaryRenderer(statusController, write = writeTerminal) {
  let buffer = "";
  let headerDone = false;
  let streamed = false;

  return {
    hasStreamedSummary: () => streamed,
    writeDelta(delta) {
      if (delta === undefined || delta === null || delta === "") return;
      streamed = true;
      statusController?.pause();
      buffer += String(delta);
      if (!headerDone) {
        const start = buffer.indexOf("**");
        const end = start < 0 ? -1 : buffer.indexOf("**", start + 2);
        if (start < 0 || end < 0) return;
        const before = buffer.slice(0, start);
        const header = buffer.slice(start + 2, end);
        const after = buffer.slice(end + 2);
        write(
          colorize(before) + `${LIME}${UNDERLINE}${header}${UNDERLINE_OFF}${LIME}${after}${RESET}`,
        );
        buffer = "";
        headerDone = true;
        return;
      }
      write(colorize(buffer));
      buffer = "";
    },
    finish() {
      if (buffer) {
        write(colorize(buffer));
        buffer = "";
      }
      if (!statusController) return;
      write("\n");
      // Let the next output event own the terminal line after the summary.
      statusController.resume({ renderNow: false });
    },
  };
}
