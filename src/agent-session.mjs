import { extractTextFromResponse, extractUsage, formatUsageSummary, isFunctionCall } from './response.mjs';
import { runToolCall, toolCallSummary } from './tool-dispatch.mjs';
import { applyFirstUserMessage, buildInputMessage } from './prompt-builder.mjs';
import { clearSession, persistResponseState, readSessionState } from './session-state.mjs';
import { formatTurnUsageReport } from './usage.mjs';

export async function handleToolCalls(openai, response, tools, cwd, onResponseUsage) {
  let current = response;
  for (;;) {
    if (onResponseUsage) onResponseUsage(extractUsage(current));
    const calls = (current?.output ?? []).filter(isFunctionCall);
    if (calls.length === 0) return current;

    const outputs = [];
    for (const call of calls) {
      const output = await runToolCall(call, cwd);
      process.stdout.write(`${toolCallSummary(call, output)}\n`);
      outputs.push({ type: 'function_call_output', call_id: call.call_id, output });
    }

    current = await openai.responses.create({ model: current.model, input: outputs, previous_response_id: current.id, store: true, tools });
  }
}

export async function sendMessage(openai, template, previousResponseId, userMessage, agentsText, cwd, onResponseUsage) {
  const baseRequest = JSON.parse(JSON.stringify(template));
  const request = previousResponseId
    ? {
        model: baseRequest.model,
        input: [buildInputMessage(userMessage)],
        store: true,
        tools: baseRequest.tools,
        previous_response_id: previousResponseId,
      }
    : {
        ...applyFirstUserMessage(baseRequest, userMessage, agentsText, cwd),
        store: true,
      };

  let response = await openai.responses.create(request);
  response = await handleToolCalls(openai, response, baseRequest.tools, cwd, onResponseUsage);
  return response;
}

export { persistResponseState, clearSession, readSessionState, extractTextFromResponse, extractUsage, formatUsageSummary, formatTurnUsageReport };
