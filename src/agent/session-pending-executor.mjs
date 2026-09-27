import { handleToolCalls as handleToolCallsDefault } from "../agent-turn/tool-loop.mjs";
import { inspectImage as inspectImageDefault } from "../image-inspector.mjs";
import { addUsageTotals as addUsageTotalsDefault } from "../response.mjs";
import { createPendingResponse as createPendingResponseDefault } from "./pending-response.mjs";

export async function executePendingSessionTools(runPendingToolCall, session, services = {}) {
  const handleToolCalls = services.handleToolCalls || handleToolCallsDefault;
  const inspectImage = services.inspectImage || inspectImageDefault;
  const addUsageTotals = services.addUsageTotals || addUsageTotalsDefault;
  const createPendingResponse = services.createPendingResponse || createPendingResponseDefault;
  const options = session.outputFlags;
  const usage = (tokens, { skipIncrement = false } = {}) => {
    const totals = session.getUsage();
    if (!skipIncrement) {
      addUsageTotals(totals, tokens);
      totals.turns += 1;
    }
    return totals;
  };

  return handleToolCalls(
    session.getOpenAI(),
    createPendingResponse(session.savedState),
    session.getTemplate(),
    session.getCwd(),
    usage,
    runPendingToolCall,
    {
      liveStreaming: true,
      sessionStartedAt: session.now(),
      skipInitialUsageAccounting: true,
      onResponseState: session.persistResponseSnapshot,
      onToolExecutionState: session.persistToolExecutionState,
      confirmToolCall: session.confirmToolCall,
      suppressStatusOutput: session.getDebugEnabled() || options.quiet,
      suppressUsageOutput: options.noUsage,
      noTimers: options.noTimers,
      colors: !options.noColors,
      noReasoning: options.noReasoning,
      noShellCalls: options.noShellCalls,
      noToolCalls: options.noToolCalls,
      noMcpOutput: options.noMcpOutput,
      noWebsearch: options.noWebsearch,
      debug: session.getDebugEnabled(),
      transitionOnlyStatus: session.oneShot || !session.terminalInput?.isTTY,
      runToolCall: runPendingToolCall,
      onImageGeneration: session.handleImageGeneration,
      onViewImage: ({ args, response, previousResponseId, baseRequest, cwd }) =>
        inspectImage(session.getOpenAI(), args, {
          cwd,
          responseId: response?.id,
          previousResponseId,
          callerResponse: response,
          model: baseRequest?.model,
          processWorker: true,
          onUsage: (imageUsage) => {
            const totals = session.getUsage();
            addUsageTotals(totals, imageUsage);
            totals.turns += imageUsage.turns || 1;
          },
        }),
      yolo: session.yoloEnabled,
      onWorkerUsage: (workerUsage) => {
        const totals = session.getUsage();
        addUsageTotals(totals, workerUsage);
        totals.turns += workerUsage.turns || 0;
      },
      onWorkerComplete: session.onWorkerComplete,
    },
  );
}
