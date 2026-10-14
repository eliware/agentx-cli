import { handleToolCalls as handleToolCallsDefault } from "../agent-turn/tool-loop.mjs";
import { inspectImage as inspectImageDefault } from "../image-inspector.mjs";
import { addUsageTotals as addUsageTotalsDefault } from "../response.mjs";
import { createPendingResponse as createPendingResponseDefault } from "./pending-response.mjs";
import { createSessionImageInspection } from "./session-image-inspection.mjs";
import { createSessionUsageCallbacks } from "./session-usage-accounting.mjs";

export async function executePendingSessionTools(runPendingToolCall, session, services = {}) {
  const handleToolCalls = services.handleToolCalls || handleToolCallsDefault;
  const inspectImage = services.inspectImage || inspectImageDefault;
  const addUsageTotals = services.addUsageTotals || addUsageTotalsDefault;
  const createPendingResponse = services.createPendingResponse || createPendingResponseDefault;
  const onViewImage = createSessionImageInspection({
    getOpenAI: session.getOpenAI,
    getSessionUsage: session.getUsage,
    addUsageTotals,
    inspectImage,
  });
  const usageCallbacks = createSessionUsageCallbacks({
    getSessionUsage: session.getUsage,
    addUsageTotals,
  });
  const options = session.outputFlags;

  return handleToolCalls(
    session.getOpenAI(),
    createPendingResponse(session.savedState),
    session.getTemplate(),
    session.getCwd(),
    usageCallbacks.onResponseUsage,
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
      onViewImage,
      yolo: session.yoloEnabled,
      onWorkerUsage: usageCallbacks.onWorkerUsage,
      onWorkerComplete: session.onWorkerComplete,
    },
  );
}
