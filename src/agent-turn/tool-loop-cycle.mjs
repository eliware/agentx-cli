import { dedupeToolCalls } from "../tool-call-identity.mjs";
import { isShellToolCall } from "./response-format.mjs";
import { isGoalToolCall } from "./goal-tools.mjs";
import { collectToolLoopUsage, writeToolLoopUsage } from "./tool-loop-usage.mjs";

const IMAGE_TOOL = "view_image";
const IMAGE_GENERATION_OUTPUT = "image_generation_call";

export async function prepareToolLoopCycle({
  current,
  cwd,
  streamOptions,
  isFirstResponse,
  skipInitialUsageAccounting,
  goalMode,
  onResponseState,
  onResponseUsage,
  baseRequest,
}) {
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
  if (onResponseState)
    await onResponseState({
      response: current,
      pendingToolCalls: calls,
      isInitialResponse: isFirstResponse,
      cumulativeUsage,
    });
  writeToolLoopUsage({
    usage,
    cumulativeUsage,
    model: baseRequest?.model,
    suppressOutput: !shouldReportUsage || Boolean(streamOptions?.suppressUsageOutput),
  });
  return { calls, cumulativeUsage };
}
