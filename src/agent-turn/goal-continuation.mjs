import { createStreamedResponse } from "./response-stream.mjs";

export async function requestGoalContinuation({
  openai,
  baseRequest,
  currentResponse,
  goalText,
  goalIterations = 0,
  goalMaxIterations = 50,
  onGoalIteration,
  onGoalLimit,
  statusController,
  streamOptions = {},
  createResponse = createStreamedResponse,
}) {
  const nextIteration = goalIterations + 1;
  await onGoalIteration?.(nextIteration);
  if (nextIteration > goalMaxIterations) {
    await onGoalLimit?.(nextIteration);
    statusController?.clear();
    return { goalIterations: nextIteration, response: currentResponse, limited: true };
  }

  const request = {
    ...baseRequest,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `You are still working on this goal: ${String(goalText || "(goal text unavailable)")}\n\nYou MUST call goal_update with method complete, incomplete, or blocked. If user input is required, call goal_blocked with a question and optional choices. Do not reply with prose.`,
          },
        ],
      },
    ],
    previous_response_id: currentResponse?.id,
    store: true,
    tool_choice: "required",
  };
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
  return {
    goalIterations: nextIteration,
    response,
    previousResponseId: request.previous_response_id || "",
    limited: false,
  };
}
