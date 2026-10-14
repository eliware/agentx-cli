import { formatSystemMessage } from "../shell-display.mjs";
import { writeTerminal } from "../terminal-output.mjs";

export async function askGoalQuestion({
  question,
  choices = [],
  getReadline,
  terminalInput,
  write = writeTerminal,
  formatMessage = formatSystemMessage,
}) {
  terminalInput.setRawMode?.(false);
  write(`${formatMessage(`GOAL QUESTION: ${question || "Input required"}`)}\n`);
  choices.forEach((choice, index) => write(`${String.fromCharCode(65 + index)}) ${choice}\n`));
  const readline = getReadline();
  return readline
    ? await readline.question(choices.length ? "Choose A-D or answer: " : "Answer: ")
    : "";
}
