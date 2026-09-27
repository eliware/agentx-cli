import { writeTerminal } from "../terminal-output.mjs";
import { formatInfoMessage } from "../shell-display.mjs";
import { formatElapsedStatus, formatTransactionCompletionMessage } from "./status-format.mjs";
import { collectToolLoopUsage, writeToolLoopUsage } from "./tool-loop-usage.mjs";

export async function finalizeToolLoopResponse({
  response,
  completionSnapshot,
  statusController,
  sessionStartedAt,
  baseRequest,
  streamOptions = {},
  onResponseState,
  onResponseUsage,
  reportFinalUsage = false,
}) {
  if (reportFinalUsage) {
    const { usage, cumulativeUsage } = collectToolLoopUsage(response, { onResponseUsage });
    await onResponseState?.({
      response,
      pendingToolCalls: [],
      isInitialResponse: false,
      cumulativeUsage,
    });
    writeToolLoopUsage({
      usage,
      cumulativeUsage,
      model: baseRequest?.model,
      suppressOutput: Boolean(streamOptions?.suppressUsageOutput),
    });
  }

  const finalSnapshot = completionSnapshot ||
    statusController?.snapshot?.() || {
      time: formatElapsedStatus(Date.now() - sessionStartedAt),
      reasoning: "0s/0s",
      writing: "0s/0s",
      executing: "0s/0s",
    };
  statusController?.clear();
  if (!streamOptions?.suppressStatusOutput && !streamOptions?.noTimers) {
    writeTerminal(`${formatInfoMessage(formatTransactionCompletionMessage(finalSnapshot))}\n`);
  }
  return response;
}
