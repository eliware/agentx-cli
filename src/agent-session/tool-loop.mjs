import { extractUsage } from '../response.mjs';
import { dedupeToolCalls, dedupeToolOutputs, requiresDestructiveConfirmation, requiresToolConfirmation, runToolCall, toolCallIdentity, toolOutputForCall } from '../tool-dispatch.mjs';
import { createUsageTotals } from '../response.mjs';
import { formatTurnUsageReport, formatUsageReport } from '../usage.mjs';
import { formatInfoMessage, formatUsageMessage } from '../shell-display.mjs';
import { createStatusLineController, formatElapsedStatus, formatTransactionCompletionMessage } from './status-controller.mjs';
import { createStreamedResponse } from './response-stream.mjs';
import { isShellToolCall } from './response-format.mjs';

const GOAL_TOOLS = new Set(['goal_update', 'goal_blocked']);
const GOAL_METHODS = new Set(['complete', 'incomplete', 'blocked', 'question']);
const IMAGE_TOOL = 'view_image';
const IMAGE_GENERATION_OUTPUT = 'image_generation_call';
function parseFunctionInput(call) { try { return JSON.parse(call?.arguments ?? call?.input ?? '{}'); } catch { return {}; } }

export async function handleToolCalls(openai, response, baseRequest, cwd, onResponseUsage, runToolCallFn = runToolCall, streamOptions = {}) {
  let current = response;
  let currentPreviousResponseId = baseRequest?.previous_response_id || '';
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
  let goalCompletionSnapshot = null;
  const goalMaxIterations = Number(streamOptions?.goalMaxIterations ?? 50);
  let isFirstResponse = true;
  const executeToolCall = streamOptions?.runToolCall || runToolCallFn;

  for (; ;) {
    if (goalMode && !goalFinished && goalCancelled()) { statusController?.clear(); return current; }
    const shouldReportUsage = !(skipInitialUsageAccounting && isFirstResponse);
    const usage = shouldReportUsage ? extractUsage(current) : createUsageTotals();
    for (const item of current?.output ?? []) {
      if (item?.type === IMAGE_GENERATION_OUTPUT && item?.result) await streamOptions?.onImageGeneration?.({ item, response: current, cwd });
    }
    const calls = dedupeToolCalls((current?.output ?? []).filter((item) => isShellToolCall(item) || (item?.type === 'function_call' && (['spawn_agent', 'agent_status', 'cancel_agent'].includes(item?.name) || (goalMode && GOAL_TOOLS.has(item?.name)) || item?.name === IMAGE_TOOL))), cwd);
    const cumulativeUsage = shouldReportUsage && onResponseUsage ? onResponseUsage(usage, { skipIncrement: false }) : null;
    if (onResponseState) {
      await onResponseState({ response: current, pendingToolCalls: calls, isInitialResponse: isFirstResponse, cumulativeUsage });
    }
    if (shouldReportUsage && !streamOptions?.suppressUsageOutput) {
      process.stdout.write(`${formatUsageMessage(formatTurnUsageReport({ ...usage, model: baseRequest?.model }))}\n`);
      if (cumulativeUsage) {
        process.stdout.write(`${formatUsageMessage(formatUsageReport({ ...cumulativeUsage, model: baseRequest?.model }))}\n`);
      }
    }
    if (calls.length === 0) {
      if (goalFinished || !goalMode) {
        const completionSnapshot = goalCompletionSnapshot || statusController?.snapshot?.() || { time: formatElapsedStatus(Date.now() - sessionStartedAt), reasoning: '0s/0s', writing: '0s/0s', executing: '0s/0s' };
        statusController?.clear();
        process.stdout.write(`${formatInfoMessage(formatTransactionCompletionMessage(completionSnapshot))}\n`);
        return current;
      }
      {
        goalIterations += 1;
        await streamOptions?.onGoalIteration?.(goalIterations);
        if (goalIterations > goalMaxIterations) { await streamOptions?.onGoalLimit?.(goalIterations); statusController?.clear(); return current; }
        const request = { ...baseRequest, input: [{ role: 'user', content: [{ type: 'input_text', text: `You are still working on this goal: ${String(streamOptions?.goalText || '(goal text unavailable)')}\n\nYou MUST call goal_update with method complete, incomplete, or blocked. If user input is required, call goal_blocked with a question and optional choices. Do not reply with prose.` }] }], previous_response_id: current.id, store: true, tool_choice: 'required' };
        current = await createStreamedResponse(openai, request, { liveStreaming, statusController, debug: Boolean(streamOptions?.debug) });
        currentPreviousResponseId = request.previous_response_id || '';
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
        if ((requiresDestructiveConfirmation(call) || (!yolo && requiresToolConfirmation(call))) && confirmToolCall) {
          statusController?.pause();
          try { approved = await confirmToolCall(call, cwd); } finally { statusController?.resume({ renderNow: false }); }
        }
        if (!approved) {
          outputs.push(toolOutputForCall(call, { type: 'shell_call_output', call_id: call.call_id || call.id || '', status: 'incomplete', output: [{ stdout: '', stderr: 'Tool execution declined by user.', outcome: { type: 'exit', exit_code: 1 } }] }));
          continue;
        }
        await onToolExecutionState?.({ call, response: current, status: 'started', identity: toolCallIdentity(call, cwd), callIndex, callCount: calls.length });
        if (goalMode && !goalFinished && goalCancelled()) { statusController?.clear(); return current; }
        if (goalMode && GOAL_TOOLS.has(call?.name)) {
          const args = parseFunctionInput(call);
          const method = String(args?.method || '').toLowerCase();
          if (call?.name === 'goal_blocked') {
            statusController?.pause();
            let answer;
            try { answer = await streamOptions?.onGoalBlocked?.(args); } finally { statusController?.resume({ renderNow: false }); }
            outputs.push(toolOutputForCall(call, answer || 'Continue without user input.'));
            continue;
          }
          if (!GOAL_METHODS.has(method)) {
            outputs.push(toolOutputForCall(call, `Invalid goal_update method "${method || '(missing)'}". Use complete, incomplete, or blocked.`));
            continue;
          }
          if (method === 'complete') {
            goalFinished = true;
            statusController?.pause?.();
            goalCompletionSnapshot = statusController?.snapshot?.() || null;
            await streamOptions?.onGoalComplete?.(args);
            outputs.push(toolOutputForCall(call, 'Goal complete acknowledged.'));
            continue;
          }
          if (method === 'blocked') {
            await streamOptions?.onGoalLimit?.(goalIterations);
            goalFinished = true;
            outputs.push(toolOutputForCall(call, 'Goal marked blocked.'));
            continue;
          }
          outputs.push(toolOutputForCall(call, 'Continue working on the goal.'));
          continue;
        }
        const output = call?.type === 'function_call' && call?.name === IMAGE_TOOL
          ? (await streamOptions?.onViewImage?.({ args: parseFunctionInput(call), response: current, previousResponseId: currentPreviousResponseId, baseRequest, cwd }) || 'ERROR: image inspection is unavailable')
          : await executeToolCall(call, cwd, { isFirstResponse, currentResponse: current, callIndex, callCount: calls.length, statusController, onWorkerUsage: streamOptions?.onWorkerUsage, onWorkerComplete: streamOptions?.onWorkerComplete, debug: Boolean(streamOptions?.debug) });
        await onToolExecutionState?.({ call, response: current, status: 'completed', identity: toolCallIdentity(call, cwd), callIndex, callCount: calls.length });
        outputs.push(toolOutputForCall(call, output));
        completed += 1;
        statusController?.updateExecuting(completed, calls.length);
      }
    } finally {
      statusController?.clear();
    }

    const requestInput = dedupeToolOutputs(outputs);
    if (goalMode && !goalFinished) requestInput.push({ role: 'user', content: [{ type: 'input_text', text: 'Review the tool results above. Do not repeat a command that completed successfully. If the goal is satisfied, call goal_update with method complete now and include a brief summary/evidence. Use another work tool only if it is genuinely required to finish the goal.' }] });
    const request = {
      ...baseRequest,
      input: requestInput,
      previous_response_id: current.id,
      store: true,
      ...(goalFinished ? { tool_choice: 'none' } : (goalMode ? { tool_choice: 'required' } : {})),
    };
    try {
      current = await createStreamedResponse(openai, request, { liveStreaming, statusController, debug: Boolean(streamOptions?.debug) });
      currentPreviousResponseId = request.previous_response_id || '';
      if (goalFinished) {
        const completionUsage = extractUsage(current);
        const cumulativeUsage = onResponseUsage ? onResponseUsage(completionUsage) : null;
        await onResponseState?.({ response: current, pendingToolCalls: [], isInitialResponse: false, cumulativeUsage });
        if (!streamOptions?.suppressUsageOutput) {
          process.stdout.write(`${formatUsageMessage(formatTurnUsageReport({ ...completionUsage, model: baseRequest?.model }))}\n`);
          if (cumulativeUsage) process.stdout.write(`${formatUsageMessage(formatUsageReport({ ...cumulativeUsage, model: baseRequest?.model }))}\n`);
        }
        const completionSnapshot = goalCompletionSnapshot || statusController?.snapshot?.() || { time: formatElapsedStatus(Date.now() - sessionStartedAt), reasoning: '0s/0s', writing: '0s/0s', executing: '0s/0s' };
        statusController?.clear();
        process.stdout.write(`${formatInfoMessage(formatTransactionCompletionMessage(completionSnapshot))}\n`);
        return current;
      }
    } catch (error) {
      await streamOptions?.onRetryState?.({ request, response: current });
      throw error;
    }
  }
}
