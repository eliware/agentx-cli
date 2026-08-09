import { getToolCallId } from './checkpoint.mjs';

const INTERRUPTED_TOOL_OUTPUT_RETRY = `The previous transaction was interrupted while tool calls were in progress.

The interrupted command may have completed successfully, failed, or only partially applied changes.

Think carefully about the likely state before acting.
- If the command is trivial and safe to repeat, you may run it again.
- Otherwise, inspect the relevant system state first, determine whether the prior action succeeded or partially succeeded, and choose the safest next step.`;
const INTERRUPTED_TOOL_OUTPUT_REQUEST = `The previous transaction was interrupted while tool calls were in progress.

Stop all further tool calls.
Do not retry the interrupted command.
Ask the user what they want to do next.`;

export function buildInterruptedToolOutput(call, mode) {
  const message = mode === 'retry' ? INTERRUPTED_TOOL_OUTPUT_RETRY : INTERRUPTED_TOOL_OUTPUT_REQUEST;
  if (call?.type === 'shell_call') return { type: 'shell_call_output', call_id: getToolCallId(call), status: 'completed', output: [{ stdout: message, stderr: '', outcome: { type: 'exit', exit_code: 0 } }] };
  return message;
}
export function createResumeToolCallRunner(mode, pendingCallIds = new Set(), uncertainCallIdentities = new Set()) {
  return async (call, cwd) => {
    const identity = `id:${getToolCallId(call)}`;
    if (pendingCallIds.has(getToolCallId(call)) || uncertainCallIdentities.has(identity)) return buildInterruptedToolOutput(call, mode === 'auto' ? 'request' : mode);
    const { runToolCall } = await import('../tool-dispatch.mjs');
    return await runToolCall(call, cwd);
  };
}
