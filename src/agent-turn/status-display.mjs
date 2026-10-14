import stripAnsi from "strip-ansi";

const WHITE = "\u001b[38;5;255m";
const GREEN = "\u001b[32m";
const RESET = "\u001b[0m";

export function createStatusDisplay({
  quiet,
  transitionOnly,
  colors,
  snapshot,
  getState,
  isPaused,
  writeOutput,
}) {
  let lastRendered = "";
  function clear() {
    if (quiet || transitionOnly || !lastRendered) return;
    if (colors) writeOutput("\r\x1b[2K\r");
    lastRendered = "";
  }
  function field(name, value) {
    const content = `"${name}":"${value.value}"`;
    return value.active ? `${GREEN}${content}${WHITE}` : content;
  }
  function write(text) {
    if (text === lastRendered) return;
    if (transitionOnly) writeOutput(`${text}\n`);
    else {
      clear();
      writeOutput(text);
    }
    lastRendered = text;
  }
  function render() {
    const state = getState();
    if (quiet || isPaused() || !state || state === "writing") return;
    const stats = snapshot();
    const status = `{"time":"${stats.time}",${field("reasoning", stats.reasoning)},${field(
      "writing",
      stats.writing,
    )},${field("executing", stats.executing)}}`;
    write(colors ? `${WHITE}${status}${RESET}` : stripAnsi(status));
  }
  return { clear, render, prepareOutput: clear };
}
