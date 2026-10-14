import { requestGoalContinuation } from "./goal-continuation.mjs";
import { finalizeToolLoopResponse } from "./tool-loop-completion.mjs";

export async function handleEmptyToolLoopCycle({
  openai,
  current,
  goalMode,
  goalState,
  goalIterations,
  goalMaxIterations,
  streamOptions,
  statusController,
  sessionStartedAt,
  baseRequest,
  liveStreaming,
}) {
  if (goalState.finished || !goalMode)
    return {
      done: true,
      response: await finalizeToolLoopResponse({
        response: current,
        completionSnapshot: goalState.completionSnapshot,
        statusController,
        sessionStartedAt,
        baseRequest,
        streamOptions,
      }),
    };
  const continuation = await requestGoalContinuation({
    openai,
    baseRequest,
    currentResponse: current,
    goalText: streamOptions.goalText,
    goalIterations,
    goalMaxIterations,
    onGoalIteration: streamOptions.onGoalIteration,
    onGoalLimit: streamOptions.onGoalLimit,
    statusController,
    streamOptions: { ...streamOptions, liveStreaming },
  });
  if (continuation.limited) return { done: true, response: current, limited: true };
  return {
    done: false,
    response: continuation.response,
    previousResponseId: continuation.previousResponseId,
    goalIterations: continuation.goalIterations,
  };
}
