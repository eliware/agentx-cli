import { extractUsage } from '../response.mjs';
import { dedupeToolCalls, dedupeToolOutputs, requiresToolConfirmation, runToolCall, toolCallIdentity, toolOutputForCall } from '../tool-dispatch.mjs';
import { createUsageTotals } from '../response.mjs';
import { formatTurnUsageReport, formatUsageReport } from '../usage.mjs';
import { formatInfoMessage, formatSystemMessage } from '../shell-display.mjs';
import { createStatusLineController, formatElapsedStatus, formatTransactionCompletionMessage } from './status-controller.mjs';
import { createStreamedResponse } from './response-stream.mjs';
import { isShellToolCall } from './response-format.mjs';

const GOAL_TOOLS = new Set(['goal_complete', 'goal_blocked']);
const IMAGE_TOOL = 'view_image';
function parseFunctionInput(call) { try { return JSON.parse(call?.arguments ?? call?.input ?? '{}'); } catch { return {}; } }

export async function handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCallFn = runToolCall, streamOptions = {}) {
  let current = response;
  const liveStreaming = Boolean(streamOptions?.liveStreaming);
  const sessionStartedAt = streamOptions?.sessionStartedAt ?? Date.now();
  const statusController = streamOptions?.statusController || (liveStreaming ? createStatusLineController(sessionStartedAt, { quiet: Boolean(streamOptions?.suppressStatusOutput), transitionOnly: Boolean(streamOptions?.transitionOnlyStatus) }) : null);
  const onResponseState = streamOptions?.onResponseState;
  const skipInitialUsageAccounting = Boolean(streamOptions?.skipInitialUsageAccounting);
  const onToolExecutionState = streamOptions?.onToolExecutionState;
  const confirmToolCall = streamOptions?.confirmToolCall;
  const yolo = Boolean(streamOptions?.yolo);
  const goalMode = Boolean(streamOptions?.goalMode);
  const goalCancelled = () => Boolean(streamOptions?.isGoalCancelled?.());
  let goalIterations = Number(streamOptions?.goalIterations ?? 0);
  let goalFinished = false;
  const goalMaxIterations = Number(streamOptions?.goalMaxIterations ?? 50);
  let isFirstResponse = true;
  const executeToolCall = streamOptions?.runToolCall || runToolCallFn;

  for (; ;) {
    if (goalMode && goalCancelled()) { statusController?.clear(); return current; }
    const shouldReportUsage = !(skipInitialUsageAccounting && isFirstResponse);
    const usage = shouldReportUsage ? extractUsage(current) : createUsageTotals();
    const calls = dedupeToolCalls((current?.output ?? []).filter((item) => isShellToolCall(item) || (item?.type === 'function_call' && (['spawn_agent', 'agent_status', 'cancel_agent'].includes(item?.name) || (goalMode && GOAL_TOOLS.has(item?.name)) || item?.name === IMAGE_TOOL))), cwd);
    const cumulativeUsage = shouldReportUsage && onResponseUsage ? onResponseUsage(usage, { skipIncrement: false }) : null;
    if (onResponseState) {
      await onResponseState({ response: current, pendingToolCalls: calls, isInitialResponse: isFirstResponse, cumulativeUsage });
    }
    if (shouldReportUsage) {
      process.stdout.write(`${formatSystemMessage(formatTurnUsageReport({ ...usage, model: baseRequest?.model }))}\n`);
      if (cumulativeUsage) {
        process.stdout.write(`${formatSystemMessage(formatUsageReport({ ...cumulativeUsage, model: baseRequest?.model }))}\n`);
      }
    }
    if (calls.length === 0) {
      if (goalFinished || !goalMode) {
        statusController?.clear();
        process.stdout.write(`${formatInfoMessage(formatTransactionCompletionMessage(statusController?.snapshot?.() ?? { time: formatElapsedStatus(Date.now() - sessionStartedAt), reasoning: '0s/0s', writing: '0s/0s', executing: '0s/0s' }))}\n`);
        return current;
      }
      {
        if (++goalIterations > goalMaxIterations) { await streamOptions?.onGoalLimit?.(goalIterations); statusController?.clear(); return current; }
        const request = { ...baseRequest, input: [{ role: 'user', content: [{ type: 'input_text', text: `You are still working on this goal: ${String(streamOptions?.goalText || '(goal text unavailable)')}\n\nReview the latest work and evidence now. If the goal is verified complete, you MUST call goal_complete immediately; do not reply with prose. If it is not complete, continue working. Call goal_blocked only when user input is required. Never claim there is no active goal while this loop is running.` }] }], previous_response_id: current.id, store: true };
        current = await createStreamedResponse(openai, request, { liveStreaming, statusController, debug: Boolean(streamOptions?.debug) });
        isFirstResponse = false;
        continue;
      }
    }

    isFirstResponse = false;
    statusController?.showExecuting(0, calls.length);
    const outputs = [];
    let completed = 0;
    try {
      for (const [callIndex, call] of calls.entries()) {
        let approved = true;
        if (!yolo && requiresToolConfirmation(call) && confirmToolCall) {
          statusController?.pause();
          try { approved = await confirmToolCall(call, cwd); } finally { statusController?.resume({ renderNow: false }); }
        }
        if (!approved) {
          outputs.push(toolOutputForCall(call, { type: 'shell_call_output', call_id: call.call_id || call.id || '', status: 'incomplete', output: [{ stdout: '', stderr: 'Tool execution declined by user.', outcome: { type: 'exit', exit_code: 1 } }] }));
          continue;
        }
        await onToolExecutionState?.({ call, response: current, status: 'started', identity: toolCallIdentity(call, cwd), callIndex, callCount: calls.length });
        if (goalMode && goalCancelled()) { statusController?.clear(); return current; }
        if (goalMode && GOAL_TOOLS.has(call?.name)) {
          const args = parseFunctionInput(call);
          if (call.name === 'goal_complete') {
            goalFinished = true;
            // Remove the live execution timer before printing the completion banner.
            statusController?.clear();
            await streamOptions?.onGoalComplete?.(args);
            outputs.push(toolOutputForCall(call, 'Goal complete acknowledged.'));
            continue;
          }
          statusController?.pause();
          let answer;
          try { answer = await streamOptions?.onGoalBlocked?.(args); } finally { statusController?.resume({ renderNow: false }); }
          outputs.push(toolOutputForCall(call, answer || 'Continue without user input.'));
          continue;
        }
        const output = call?.type === 'function_call' && call?.name === IMAGE_TOOL
          ? (await streamOptions?.onViewImage?.({ args: parseFunctionInput(call), response: current, baseRequest, cwd }) || 'ERROR: image inspection is unavailable')
          : await executeToolCall(call, cwd, { isFirstResponse, currentResponse: current, callIndex, callCount: calls.length, statusController });
        await onToolExecutionState?.({ call, response: current, status: 'completed', identity: toolCallIdentity(call, cwd), callIndex, callCount: calls.length });
        outputs.push(toolOutputForCall(call, output));
        completed += 1;
        statusController?.updateExecuting(completed, calls.length);
      }
    } finally {
      statusController?.clear();
    }

    const request = {
      ...baseRequest,
      input: dedupeToolOutputs(outputs),
      previous_response_id: current.id,
      store: true,
    };
    try {
      current = await createStreamedResponse(openai, request, { liveStreaming, statusController, debug: Boolean(streamOptions?.debug) });
    } catch (error) {
      await streamOptions?.onRetryState?.({ request, response: current });
      throw error;
    }
  }
}
