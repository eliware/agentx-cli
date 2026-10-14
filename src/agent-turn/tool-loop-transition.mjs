export function applyToolLoopTransition(state, result) {
  state.current = result.response;
  state.currentPreviousResponseId = result.previousResponseId;
  if (result.goalIterations !== undefined) state.goalIterations = result.goalIterations;
}
