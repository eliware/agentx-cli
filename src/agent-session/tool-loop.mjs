import { extractUsage } from '../response.mjs';
import { dedupeToolCalls, dedupeToolOutputs, requiresToolConfirmation, runToolCall, toolCallIdentity, toolOutputForCall } from '../tool-dispatch.mjs';
import { createUsageTotals } from '../response.mjs';
import { formatTurnUsageReport, formatUsageReport } from '../usage.mjs';
import { formatInfoMessage, formatSystemMessage } from '../shell-display.mjs';
import { createStatusLineController, formatElapsedStatus, formatTransactionCompletionMessage } from './status-controller.mjs';
import { createStreamedResponse } from './response-stream.mjs';
import { isShellToolCall } from './response-format.mjs';

const GOAL_TOOLS = new Set(['goal_complete', 'goal_blocked']);
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
  let goalIterations = Number(streamOptions?.goalIterations ?? 0);
  let goalFinished = false;
  const goalMaxIterations = Number(streamOptions?.goalMaxIterations ?? 50);
  let isFirstResponse = true;
  const executeToolCall = streamOptions?.runToolCall || runToolCallFn;

  for (; ;) {
    const shouldReportUsage = !(skipInitialUsageAccounting && isFirstResponse);
    const usage = shouldReportUsage ? extractUsage(current) : createUsageTotals();
    const calls = dedupeToolCalls((current?.output ?? []).filter((item) => isShellToolCall(item) || (item?.type === 'function_call' && (['spawn_agent', 'agent_status', 'cancel_agent'].includes(item?.name) || (goalMode && GOAL_TOOLS.has(item?.name))))), cwd);
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
        const request = { ...baseRequest, input: [{ role: 'user', content: [{ type: 'input_text', text: 'Goal not complete. Continue working. Call goal_complete only when verified; call goal_blocked only when user input is required.' }] }], previous_response_id: current.id, store: true };
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
        if (goalMode && GOAL_TOOLS.has(call?.name)) {
          const args = parseFunctionInput(call);
          if (call.name === 'goal_complete') {
            goalFinished = true;
            await streamOptions?.onGoalComplete?.(args);
            outputs.push(toolOutputForCall(call, 'Goal complete acknowledged.'));
            continue;
          }
          const answer = await streamOptions?.onGoalBlocked?.(args);
          outputs.push(toolOutputForCall(call, answer || 'Continue without user input.'));
          continue;
        }
        const output = await executeToolCall(call, cwd, { isFirstResponse, currentResponse: current, callIndex, callCount: calls.length, statusController });
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
