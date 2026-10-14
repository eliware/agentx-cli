import { approveToolCall, declinedToolOutput } from "./tool-call-approval.mjs";
import { executeOneToolCall } from "./tool-call-execution.mjs";

export async function executeToolCallSequence(options) {
  const { calls, cwd, statusController, streamOptions = {} } = options;
  const outputs = [];
  const pending = [];
  const flush = () => {
    if (!pending.length) return;
    statusController?.pause?.();
    while (pending.length) streamOptions.onWorkerComplete?.(pending.shift());
    statusController?.resume?.({ renderNow: false });
  };
  const queue = (worker) => {
    if (!worker) return;
    pending.push(worker);
    if (!statusController?.isWriting?.()) flush();
  };
  let completed = 0;
  statusController?.showExecuting(0, calls.length);
  try {
    for (const [callIndex, call] of calls.entries()) {
      if (!(await approveToolCall(call, cwd, streamOptions, statusController))) {
        outputs.push(declinedToolOutput(call));
        continue;
      }
      const result = await executeOneToolCall({
        ...options,
        call,
        callIndex,
        streamOptions: { ...streamOptions, onWorkerComplete: queue },
      });
      if (result.cancelled) return { outputs, cancelled: true };
      outputs.push(result.output);
      flush();
      completed += 1;
      statusController?.updateExecuting(completed, calls.length);
    }
  } finally {
    statusController?.clear();
  }
  flush();
  return { outputs, cancelled: false };
}
