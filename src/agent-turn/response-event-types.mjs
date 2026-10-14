export function isResponseCompletedEvent(event, raw) {
  return (
    event?.type === "response.completed" ||
    (typeof raw === "string" && raw.includes('"type":"response.completed"'))
  );
}

export function isFunctionCallArgumentsDeltaEvent(event) {
  return event?.type === "response.function_call_arguments.delta";
}

export function isShellCallCommandDeltaEvent(event) {
  return event?.type === "response.shell_call_command.delta";
}

export function isWebSearchEvent(event) {
  return typeof event?.type === "string" && event.type.startsWith("response.web_search_call.");
}

export function isMcpEvent(event) {
  return typeof event?.type === "string" && event.type.startsWith("response.mcp_");
}

export function isReasoningSummaryEvent(event) {
  return typeof event?.type === "string" && event.type.startsWith("response.reasoning_summary_");
}
