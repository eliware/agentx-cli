import { toolOutputForCall } from "../tool-output-adapter.mjs";
import { toolCallIdentity } from "../tool-call-identity.mjs";
import { requiresDestructiveConfirmation, requiresToolConfirmation } from "../tool-permissions.mjs";
import { handleGoalToolCall, isGoalToolCall } from "./goal-tools.mjs";

const IMAGE_TOOL = "view_image";

function parseFunctionInput(call) {
  try {
    return JSON.parse(call?.arguments ?? call?.input ?? "{}");
  } catch {
    return {};
  }
}

export async function executeToolCallSequence({
  calls,
  cwd,
  currentResponse,
  previousResponseId,
  baseRequest,
  isFirstResponse,
  executeToolCall,
  streamOptions = {},
  statusController,
  goalMode = false,
  goalState = { finished: false, completionSnapshot: null },
  goalIterations = 0,
}) {
  const outputs = [];
  const pendingWorkerCompletions = [];
  const queueWorkerCompletion = (worker) => {
    if (!worker) return;
    pendingWorkerCompletions.push(worker);
    if (!statusController?.isWriting?.()) flushWorkerCompletions();
  };
  const flushWorkerCompletions = () => {
    if (!pendingWorkerCompletions.length) return;
    statusController?.pause?.();
    while (pendingWorkerCompletions.length)
      streamOptions?.onWorkerComplete?.(pendingWorkerCompletions.shift());
    statusController?.resume?.({ renderNow: false });
  };

  let completed = 0;
  statusController?.showExecuting(0, calls.length);
  try {
    for (const [callIndex, call] of calls.entries()) {
      let approved = true;
      if (
        !streamOptions.yolo &&
        (requiresDestructiveConfirmation(call) || requiresToolConfirmation(call)) &&
        streamOptions.confirmToolCall
      ) {
        statusController?.pause();
        try {
          approved = await streamOptions.confirmToolCall(call, cwd);
        } finally {
          statusController?.resume({ renderNow: false });
        }
      }
      if (!approved) {
        outputs.push(
          toolOutputForCall(call, {
            type: "shell_call_output",
            call_id: call.call_id || call.id || "",
            status: "incomplete",
            output: [
              {
                stdout: "",
                stderr: "Tool execution declined by user.",
                outcome: { type: "exit", exit_code: 1 },
              },
            ],
          }),
        );
        continue;
      }

      await streamOptions.onToolExecutionState?.({
        call,
        response: currentResponse,
        status: "started",
        identity: toolCallIdentity(call, cwd),
        callIndex,
        callCount: calls.length,
      });
      if (goalMode && streamOptions.isGoalCancelled?.()) return { outputs, cancelled: true };

      if (goalMode && isGoalToolCall(call)) {
        outputs.push(
          toolOutputForCall(
            call,
            await handleGoalToolCall(call, {
              goalState,
              goalIterations,
              statusController,
              callbacks: {
                onGoalBlocked: streamOptions.onGoalBlocked,
                onGoalComplete: streamOptions.onGoalComplete,
                onGoalLimit: streamOptions.onGoalLimit,
              },
            }),
          ),
        );
        continue;
      }

      const output =
        call?.type === "function_call" && call?.name === IMAGE_TOOL
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
              onWorkerComplete: queueWorkerCompletion,
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
      outputs.push(toolOutputForCall(call, output));
      flushWorkerCompletions();
      completed += 1;
      statusController?.updateExecuting(completed, calls.length);
    }
  } finally {
    statusController?.clear();
  }
  flushWorkerCompletions();
  return { outputs, cancelled: false };
}
