import { createResponseTextRenderer } from "./response-text-renderer.mjs";
import { createReasoningSummaryRenderer } from "./reasoning-summary-renderer.mjs";
import { createWebSearchRenderer } from "./web-search-renderer.mjs";
import { createMcpEventRenderer } from "./mcp-event-renderer.mjs";
import { createToolEventRenderer } from "./tool-event-renderer.mjs";

export function createResponseRenderers({ statusController, markOutput }) {
  return {
    text: createResponseTextRenderer(),
    reasoning: createReasoningSummaryRenderer(statusController),
    webSearch: createWebSearchRenderer(statusController),
    mcp: createMcpEventRenderer({ statusController, markOutput }),
    tool: createToolEventRenderer(),
  };
}
