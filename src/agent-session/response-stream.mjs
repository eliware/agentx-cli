import { writeTerminal } from '../terminal-output.mjs';
import { createLiveResponseHandlers } from './response-events.mjs';

export async function createStreamedResponse(openai, request, { liveStreaming = false, statusController = null, debug = false, colors = true, noReasoning = false, noShellCalls = false, noToolCalls = false, noMcpOutput = false, noWebsearch = false } = {}) {
  if (liveStreaming) statusController?.showReasoning();
  const live = createLiveResponseHandlers({ liveStreaming, statusController, colors, noReasoning, noShellCalls, noToolCalls, noMcpOutput, noWebsearch, ...(debug ? { debug: true } : {}) });
  const handlers = live.handlers ? { ...live.handlers } : (debug ? {} : undefined);
  if (debug) handlers.onEvent = (event, raw) => process.stderr.write(`[openai:event] ${JSON.stringify(raw ?? event)}\n`);
  try {
    const response = await openai.responses.create(request, handlers);
    if (liveStreaming && live.sawOutput()) { live.flushTextDelta(); if (colors) writeTerminal('\u001b[0m'); if (!live.streamedText().endsWith('\n')) writeTerminal('\n'); }
    return response;
  } finally {
    statusController?.clear();
  }
}
