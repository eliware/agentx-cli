import { createStatusLineController } from "./status-controller.mjs";

export function createToolLoopState({ response, baseRequest, runToolCallFn, streamOptions = {} }) {
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
  return {
    current: response,
    currentPreviousResponseId: baseRequest?.previous_response_id || "",
    liveStreaming,
    sessionStartedAt,
    statusController,
    onResponseState: streamOptions?.onResponseState,
    skipInitialUsageAccounting: Boolean(streamOptions?.skipInitialUsageAccounting),
    goalMode: Boolean(streamOptions?.goalMode),
    goalIterations: Number(streamOptions?.goalIterations ?? 0),
    goalState: { finished: false, completionSnapshot: null },
    goalMaxIterations: Number(streamOptions?.goalMaxIterations ?? 50),
    executeToolCall: streamOptions?.runToolCall || runToolCallFn,
  };
}
