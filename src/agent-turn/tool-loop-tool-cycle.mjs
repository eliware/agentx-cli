import { dedupeToolOutputs } from "../tool-call-identity.mjs";
import { requestToolContinuation } from "./tool-continuation.mjs";
import { executeToolCallSequence } from "./tool-call-runner.mjs";
import { finalizeToolLoopResponse } from "./tool-loop-completion.mjs";

export async function executeToolLoopCycle(options) {
  const execution = await executeToolCallSequence({ ...options, isFirstResponse: false });
  if (execution.cancelled) return { cancelled: true, response: options.currentResponse };
  const continuation = await requestToolContinuation({
    openai: options.openai,
    baseRequest: options.baseRequest,
    currentResponse: options.currentResponse,
    outputs: dedupeToolOutputs(execution.outputs),
    goalMode: options.goalMode,
    goalFinished: options.goalState.finished,
    streamOptions: { ...options.streamOptions, liveStreaming: options.liveStreaming },
    statusController: options.statusController,
    onRetryState: options.streamOptions?.onRetryState,
  });
  if (!options.goalState.finished) return { cancelled: false, ...continuation };
  const response = await finalizeToolLoopResponse({
    response: continuation.response,
    completionSnapshot: options.goalState.completionSnapshot,
    statusController: options.statusController,
    sessionStartedAt: options.sessionStartedAt,
    baseRequest: options.baseRequest,
    streamOptions: options.streamOptions,
    onResponseState: options.onResponseState,
    onResponseUsage: options.onResponseUsage,
    reportFinalUsage: true,
  });
  return { cancelled: false, done: true, response };
}
