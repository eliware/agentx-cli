import { writeTerminal } from "../terminal-output.mjs";
import { createResponseAnsiParser } from "./response-ansi-parser.mjs";

const WHITE = "\u001b[38;5;255m";

export function createResponseTextRenderer(write = writeTerminal) {
  const parser = createResponseAnsiParser();
  let textOutputStarted = false;

  const writeParsedText = (output) => {
    if (!output) return;
    write(`${textOutputStarted ? "" : WHITE}${output}`);
    textOutputStarted = true;
  };

  return {
    writeTextDelta(text) {
      writeParsedText(parser.parse(text));
    },
    flushTextDelta() {
      writeParsedText(parser.flush());
    },
  };
}
