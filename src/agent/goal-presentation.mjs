import { formatSystemMessage } from "../shell-display.mjs";

export function createGoalPresentation({
  write,
  formatMessage = formatSystemMessage,
  printFinalResponse = (text) => write(text),
}) {
  return {
    onGoalLimit: (iterations) =>
      write(`${formatMessage(`Goal stopped after ${iterations} iterations`)}\n`),
    onGoalFinalResponse: (text) => {
      if (text) printFinalResponse(text);
    },
  };
}
