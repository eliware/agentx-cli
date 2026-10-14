import { writeTerminal } from "../terminal-output.mjs";
import { formatWebSearchCompletion } from "./web-search-completion-format.mjs";

const PINK = "\u001b[38;5;213m";
const RESET = "\u001b[0m";
const colorize = (text) => `${PINK}${text}${RESET}`;

export function createWebSearchRenderer(statusController, write = writeTerminal) {
  const statusLine = (stage) => colorize(JSON.stringify({ web_search: stage }));
  return {
    start() {
      if (!statusController) return;
      statusController.showExecuting(0, 0, { renderNow: false });
      statusController.pause();
      write(`${statusLine("in_progress")}\n`);
    },
    searching() {
      write(`${statusLine("searching")}\n`);
    },
    finish(item) {
      if (!statusController) return;
      const line = formatWebSearchCompletion(item);
      if (!line) return;
      statusController.showReasoning({ renderNow: false });
      write(`${line}\n`);
      statusController.resume();
    },
  };
}
