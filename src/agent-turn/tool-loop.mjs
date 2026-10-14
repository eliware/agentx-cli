import { runToolCall } from "../tool-dispatch.mjs";
import { prepareToolLoopCycle } from "./tool-loop-cycle.mjs";
import { handleEmptyToolLoopCycle } from "./tool-loop-empty-cycle.mjs";
import { executeToolLoopCycle } from "./tool-loop-tool-cycle.mjs";
import { createToolLoopState } from "./tool-loop-state.mjs";
import * as toolLoopPolicy from "./tool-loop-policy.mjs";

export async function handleToolCalls(
  openai,
  response,
  baseRequest,
  cwd,
  onResponseUsage,
  runToolCallFn = runToolCall,
  streamOptions = {},
) {
  const state = createToolLoopState({ response, baseRequest, runToolCallFn, streamOptions });
  let { current, currentPreviousResponseId, goalIterations } = state;
  const {
    liveStreaming,
    sessionStartedAt,
    statusController,
    onResponseState,
    skipInitialUsageAccounting,
    goalMode,
    goalState,
    goalMaxIterations,
    executeToolCall,
  } = state;
  toolLoopPolicy.initializeToolLoopLifecycle(statusController);
  let isFirstResponse = true;
  for (;;) {
    if (
      toolLoopPolicy.stopToolLoopForCancellation({
        goalMode,
        goalFinished: goalState.finished,
        isGoalCancelled: streamOptions?.isGoalCancelled,
        statusController,
      })
    )
      return current;
    const { calls } = await prepareToolLoopCycle({
      current,
      cwd,
      streamOptions,
      isFirstResponse,
      skipInitialUsageAccounting,
      goalMode,
      onResponseState,
      onResponseUsage,
      baseRequest,
    });
    isFirstResponse = false;
    if (calls.length === 0) {
      const result = await handleEmptyToolLoopCycle({
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
      });
      if (result.done) return result.response;
      goalIterations = result.goalIterations;
      current = result.response;
      currentPreviousResponseId = result.previousResponseId;
      continue;
    }

    const result = await executeToolLoopCycle({
      openai,
      calls,
      cwd,
      currentResponse: current,
      previousResponseId: currentPreviousResponseId,
      baseRequest,
      executeToolCall,
      streamOptions,
      statusController,
      goalMode,
      goalIterations,
      goalState,
      liveStreaming,
      sessionStartedAt,
      onResponseState,
      onResponseUsage,
    });
    if (toolLoopPolicy.shouldStopAfterToolCycle(result, state, streamOptions)) return current;
    if (result.done) return result.response;
    current = result.response;
    currentPreviousResponseId = result.previousResponseId;
  }
}
