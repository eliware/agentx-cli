import { toolOutputForCall } from "../tool-output-adapter.mjs";
import { toolCallIdentity } from "../tool-call-identity.mjs";
import { handleGoalToolCall, isGoalToolCall } from "./goal-tools.mjs";

const IMAGE_TOOL = "view_image";

function parseFunctionInput(call) {
  try {
    return JSON.parse(call?.arguments ?? call?.input ?? "{}");
  } catch {
    return {};
  }
}

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
      : call?.type === "function_call" && call?.name === IMAGE_TOOL
        ? (await streamOptions.onViewImage?.({
            args: parseFunctionInput(call),
            response: currentResponse,
            previousResponseId,
            baseRequest,
            cwd,
          })) || "ERROR: image inspection is unavailable"
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
