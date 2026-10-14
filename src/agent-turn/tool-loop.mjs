import { setActiveStatusController } from "../terminal-output.mjs";
import { runToolCall } from "../tool-dispatch.mjs";
import { createStatusLineController } from "./status-controller.mjs";
import { prepareToolLoopCycle } from "./tool-loop-cycle.mjs";
import { handleEmptyToolLoopCycle } from "./tool-loop-empty-cycle.mjs";
import { executeToolLoopCycle } from "./tool-loop-tool-cycle.mjs";

export async function handleToolCalls(
  openai,
  response,
  baseRequest,
  cwd,
  onResponseUsage,
  runToolCallFn = runToolCall,
  streamOptions = {},
) {
  let current = response;
  let currentPreviousResponseId = baseRequest?.previous_response_id || "";
  const liveStreaming = Boolean(streamOptions?.liveStreaming);
  const sessionStartedAt = streamOptions?.sessionStartedAt ?? Date.now();
  const statusController =
    streamOptions?.statusController ||
    (liveStreaming
      ? createStatusLineController(sessionStartedAt, {
          quiet: Boolean(streamOptions?.suppressStatusOutput || streamOptions?.noTimers),
          transitionOnly: Boolean(streamOptions?.transitionOnlyStatus),
          colors: streamOptions?.colors !== false,
        })
      : null);
  const onResponseState = streamOptions?.onResponseState;
  setActiveStatusController(statusController);
  const skipInitialUsageAccounting = Boolean(streamOptions?.skipInitialUsageAccounting);
  const goalMode = Boolean(streamOptions?.goalMode);
  let goalIterations = Number(streamOptions?.goalIterations ?? 0);
  const goalState = { finished: false, completionSnapshot: null };
  const goalMaxIterations = Number(streamOptions?.goalMaxIterations ?? 50);
  let isFirstResponse = true;
  const executeToolCall = streamOptions?.runToolCall || runToolCallFn;
  for (;;) {
    if (goalMode && !goalState.finished && streamOptions?.isGoalCancelled?.()) {
      statusController?.clear();
      return current;
    }
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
    if (result.cancelled) return current;
    if (result.done) return result.response;
    current = result.response;
    currentPreviousResponseId = result.previousResponseId;
  }
}
