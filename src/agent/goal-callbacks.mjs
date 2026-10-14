import { formatSystemMessage } from "../shell-display.mjs";
import { writeTerminal } from "../terminal-output.mjs";
import { createGoalQuestionCallback } from "./goal-question-callback.mjs";
import { createGoalPresentation } from "./goal-presentation.mjs";

export function createGoalCallbacks({
  getGoal,
  setGoal,
  saveState,
  getReadline,
  terminalInput,
  write = writeTerminal,
  formatMessage = formatSystemMessage,
  printFinalResponse = (text) => write(text),
}) {
  const presentation = createGoalPresentation({ write, formatMessage, printFinalResponse });
  const onGoalBlocked = createGoalQuestionCallback({
    getGoal,
    setGoal,
    saveState,
    getReadline,
    terminalInput,
    write,
    formatMessage,
  });
  return {
    onGoalIteration: async (iterations) => {
      const goal = getGoal();
      if (goal?.status !== "active") return;
      setGoal({ ...goal, iterations });
      await saveState();
    },
    onGoalComplete: async (result) => {
      setGoal({
        ...getGoal(),
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
      });
      await saveState();
    },
    onGoalBlocked,
    onGoalLimit: async (iterations) => {
      setGoal({ ...getGoal(), status: "blocked", iterations });
      await saveState();
      presentation.onGoalLimit(iterations);
    },
    onGoalFinalResponse: presentation.onGoalFinalResponse,
  };
}
