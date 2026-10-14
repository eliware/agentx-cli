import { createDebugEventHandler } from "./response-debug-events.mjs";

export function createResponseStreamHandlers(live, debug) {
  const handlers = live.handlers ? { ...live.handlers } : debug ? {} : undefined;
  if (debug) handlers.onEvent = createDebugEventHandler();
  return handlers;
}
