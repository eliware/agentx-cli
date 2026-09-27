import { createStreamedResponse } from "./response-stream.mjs";

const GOAL_REVIEW_INSTRUCTION =
  "Review the tool results above. Do not repeat a command that completed successfully. If the goal is satisfied, call goal_update with method complete now and include a brief summary/evidence. Use another work tool only if it is genuinely required to finish the goal.";

export async function requestToolContinuation({
  openai,
  baseRequest,
  currentResponse,
  outputs,
  goalMode = false,
  goalFinished = false,
  streamOptions = {},
  statusController,
  onRetryState,
  createResponse = createStreamedResponse,
}) {
  const input = [...outputs];
  if (goalMode && !goalFinished)
    input.push({
      role: "user",
      content: [{ type: "input_text", text: GOAL_REVIEW_INSTRUCTION }],
    });
  const request = {
    ...baseRequest,
    input,
    previous_response_id: currentResponse.id,
    store: true,
    ...(goalFinished ? { tool_choice: "none" } : goalMode ? { tool_choice: "required" } : {}),
  };

  try {
    const response = await createResponse(openai, request, {
      liveStreaming: Boolean(streamOptions?.liveStreaming),
      statusController,
      debug: Boolean(streamOptions?.debug),
      colors: streamOptions?.colors !== false,
      noReasoning: Boolean(streamOptions?.noReasoning),
      noShellCalls: Boolean(streamOptions?.noShellCalls),
      noToolCalls: Boolean(streamOptions?.noToolCalls),
      noMcpOutput: Boolean(streamOptions?.noMcpOutput),
      noWebsearch: Boolean(streamOptions?.noWebsearch),
    });
    return { request, response, previousResponseId: request.previous_response_id || "" };
  } catch (error) {
    await onRetryState?.({ request, response: currentResponse });
    throw error;
  }
}
