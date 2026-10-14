import { toolOutputForCall } from "../tool-output-adapter.mjs";
import { toolCallIdentity } from "../tool-call-identity.mjs";
import { isGoalToolCall } from "./goal-tool-classifier.mjs";
import { handleGoalToolCall } from "./goal-tool-handler.mjs";
import { executeImageToolCall, isImageToolCall } from "./tool-image-call.mjs";

export async function executeOneToolCall({
  call,
  callIndex,
  calls,
  cwd,
  currentResponse,
  previousResponseId,
  baseRequest,
  isFirstResponse,
  executeToolCall,
  streamOptions,
  statusController,
  goalMode,
  goalState,
  goalIterations,
}) {
  await streamOptions.onToolExecutionState?.({
    call,
    response: currentResponse,
    status: "started",
    identity: toolCallIdentity(call, cwd),
    callIndex,
    callCount: calls.length,
  });
  if (goalMode && streamOptions.isGoalCancelled?.()) return { cancelled: true };
  const output =
    goalMode && isGoalToolCall(call)
      ? await handleGoalToolCall(call, {
          goalState,
          goalIterations,
          statusController,
          callbacks: {
            onGoalBlocked: streamOptions.onGoalBlocked,
            onGoalComplete: streamOptions.onGoalComplete,
            onGoalLimit: streamOptions.onGoalLimit,
          },
        })
      : isImageToolCall(call)
        ? await executeImageToolCall(call, {
            onViewImage: streamOptions.onViewImage,
            response: currentResponse,
            previousResponseId,
            baseRequest,
            cwd,
          })
        : await executeToolCall(call, cwd, {
            isFirstResponse,
            currentResponse,
            callIndex,
            callCount: calls.length,
            statusController,
            onWorkerUsage: streamOptions.onWorkerUsage,
            onWorkerComplete: streamOptions.onWorkerComplete,
            debug: Boolean(streamOptions.debug),
          });
  if (goalMode && !goalState?.finished && streamOptions.isGoalCancelled?.())
    return { cancelled: true };
  await streamOptions.onToolExecutionState?.({
    call,
    response: currentResponse,
    status: "completed",
    identity: toolCallIdentity(call, cwd),
    callIndex,
    callCount: calls.length,
  });
  return { output: toolOutputForCall(call, output), cancelled: false };
}
