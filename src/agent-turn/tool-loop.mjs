import { setActiveStatusController } from "../terminal-output.mjs";
import { runToolCall } from "../tool-dispatch.mjs";
import { dedupeToolCalls, dedupeToolOutputs } from "../tool-call-identity.mjs";
import { createStatusLineController } from "./status-controller.mjs";
import { requestToolContinuation } from "./tool-continuation.mjs";
import { isShellToolCall } from "./response-format.mjs";
import { executeToolCallSequence } from "./tool-call-runner.mjs";
import { isGoalToolCall } from "./goal-tools.mjs";
import { collectToolLoopUsage, writeToolLoopUsage } from "./tool-loop-usage.mjs";
import { requestGoalContinuation } from "./goal-continuation.mjs";
import { finalizeToolLoopResponse } from "./tool-loop-completion.mjs";

const IMAGE_TOOL = "view_image";
const IMAGE_GENERATION_OUTPUT = "image_generation_call";

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
    const shouldReportUsage = !(skipInitialUsageAccounting && isFirstResponse);
    const { usage, cumulativeUsage } = collectToolLoopUsage(current, {
      shouldReport: shouldReportUsage,
      onResponseUsage,
      callbackOptions: shouldReportUsage ? { skipIncrement: false } : undefined,
    });
    for (const item of current?.output ?? []) {
      if (item?.type === IMAGE_GENERATION_OUTPUT && item?.result)
        await streamOptions?.onImageGeneration?.({ item, response: current, cwd });
    }
    const calls = dedupeToolCalls(
      (current?.output ?? []).filter(
        (item) =>
          isShellToolCall(item) ||
          (item?.type === "function_call" &&
            (["spawn_agent", "agent_status", "cancel_agent"].includes(item?.name) ||
              (goalMode && isGoalToolCall(item)) ||
              item?.name === IMAGE_TOOL)),
      ),
      cwd,
    );
    if (onResponseState) {
      await onResponseState({
        response: current,
        pendingToolCalls: calls,
        isInitialResponse: isFirstResponse,
        cumulativeUsage,
      });
    }
    writeToolLoopUsage({
      usage,
      cumulativeUsage,
      model: baseRequest?.model,
      suppressOutput: !shouldReportUsage || Boolean(streamOptions?.suppressUsageOutput),
    });
    if (calls.length === 0) {
      if (goalState.finished || !goalMode) {
        return finalizeToolLoopResponse({
          response: current,
          completionSnapshot: goalState.completionSnapshot,
          statusController,
          sessionStartedAt,
          baseRequest,
          streamOptions,
        });
      }
      {
        const continuation = await requestGoalContinuation({
          openai,
          baseRequest,
          currentResponse: current,
          goalText: streamOptions?.goalText,
          goalIterations,
          goalMaxIterations,
          onGoalIteration: streamOptions?.onGoalIteration,
          onGoalLimit: streamOptions?.onGoalLimit,
          statusController,
          streamOptions: {
            ...streamOptions,
            liveStreaming,
          },
        });
        goalIterations = continuation.goalIterations;
        if (continuation.limited) return current;
        current = continuation.response;
        currentPreviousResponseId = continuation.previousResponseId;
        isFirstResponse = false;
        continue;
      }
    }

    isFirstResponse = false;
    const execution = await executeToolCallSequence({
      calls,
      cwd,
      currentResponse: current,
      previousResponseId: currentPreviousResponseId,
      baseRequest,
      isFirstResponse,
      executeToolCall,
      streamOptions,
      statusController,
      goalMode,
      goalState,
      goalIterations,
    });
    if (execution.cancelled) return current;
    const { outputs } = execution;

    const continuation = await requestToolContinuation({
      openai,
      baseRequest,
      currentResponse: current,
      outputs: dedupeToolOutputs(outputs),
      goalMode,
      goalFinished: goalState.finished,
      streamOptions: { ...streamOptions, liveStreaming },
      statusController,
      onRetryState: streamOptions?.onRetryState,
    });
    current = continuation.response;
    currentPreviousResponseId = continuation.previousResponseId;
    if (goalState.finished) {
      return finalizeToolLoopResponse({
        response: current,
        completionSnapshot: goalState.completionSnapshot,
        statusController,
        sessionStartedAt,
        baseRequest,
        streamOptions,
        onResponseState,
        onResponseUsage,
        reportFinalUsage: true,
      });
    }
  }
}
