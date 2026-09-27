import { writeTerminal } from "../terminal-output.mjs";

const WHITE = "\u001b[38;5;255m";

export function createResponseTextRenderer(write = writeTerminal) {
  let pendingAnsi = "";
  let textOutputStarted = false;

  const writeTextDelta = (text) => {
    const input = `${pendingAnsi}${text}`;
    pendingAnsi = "";
    let output = "";
    let index = 0;
    while (index < input.length) {
      if (input[index] !== "\u001b") {
        output += input[index++];
        continue;
      }
      if (index + 1 >= input.length) {
        pendingAnsi = input.slice(index);
        break;
      }
      if (input[index + 1] !== "[") {
        output += input[index++];
        continue;
      }
      let end = index + 2;
      while (
        end < input.length &&
        !(input.charCodeAt(end) >= 0x40 && input.charCodeAt(end) <= 0x7e)
      )
        end += 1;
      if (end >= input.length) {
        pendingAnsi = input.slice(index);
        break;
      }
      output += input.slice(index, end + 1);
      index = end + 1;
    }
    if (!output) return;
    write(`${textOutputStarted ? "" : WHITE}${output}`);
    textOutputStarted = true;
  };

  return {
    writeTextDelta,
    flushTextDelta() {
      if (pendingAnsi) {
        writeTextDelta(pendingAnsi);
        pendingAnsi = "";
      }
    },
  };
}
