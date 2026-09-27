import { writeTerminal } from "../terminal-output.mjs";

const PINK = "\u001b[38;5;213m";
const RESET = "\u001b[0m";
const colorize = (text) => `${PINK}${text}${RESET}`;

export function formatWebSearchCompletion(item) {
  const queries = Array.isArray(item?.action?.queries)
    ? item.action.queries.filter(Boolean).map(String)
    : [];
  const sources = Array.isArray(item?.action?.sources)
    ? item.action.sources.map((source) => String(source?.url ?? source)).filter(Boolean)
    : [];
  if (queries.length === 0 && sources.length === 0) return "";
  return colorize(JSON.stringify({ web_search: "complete", queries, sources }, null, 2));
}

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
