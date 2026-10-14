import { askGoalQuestion } from "./goal-question.mjs";

export function createGoalQuestionCallback({
  getGoal,
  setGoal,
  saveState,
  getReadline,
  terminalInput,
  write,
  formatMessage,
  ask = askGoalQuestion,
}) {
  return async ({ question, choices = [] }) => {
    const answer = await ask({
      question,
      choices,
      getReadline,
      terminalInput,
      write,
      formatMessage,
    });
    setGoal({ ...getGoal(), last_question: question });
    await saveState();
    return answer;
  };
}
