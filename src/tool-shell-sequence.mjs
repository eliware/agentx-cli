import { executeShellCommand } from "./tool-shell.mjs";

function normalizeCommands(commands) {
  if (Array.isArray(commands)) return commands.map((command) => String(command ?? ""));
  if (typeof commands === "string") return [commands];
  return [];
}

function normalizeSteps(steps, defaultCwd = "") {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => ({
    command: String(step?.command ?? ""),
    cwd: step?.cwd == null ? String(defaultCwd ?? "") : String(step.cwd),
    timeoutMs: step?.timeoutMs ?? null,
    maxOutputLength: step?.maxOutputLength ?? null,
  }));
}

export async function runShellCommandSequence(steps, { callId, defaultCwd = "", signal } = {}) {
  const normalizedSteps = normalizeSteps(steps, defaultCwd);
  const output = [];
  let status = "completed";
  let maxOutputLength = null;

  for (const step of normalizedSteps) {
    const chunk = await executeShellCommand(step.command, step.cwd, {
      timeoutMs: step.timeoutMs,
      maxOutputLength: step.maxOutputLength,
      signal,
    });
    output.push(chunk);
    const stepLimit = Number(step.maxOutputLength);
    if (Number.isFinite(stepLimit) && stepLimit > 0) {
      maxOutputLength = maxOutputLength == null ? stepLimit : Math.max(maxOutputLength, stepLimit);
    }
    if (chunk.outcome?.type === "timeout") {
      status = "incomplete";
      break;
    }
  }

  return {
    type: "shell_call_output",
    call_id: callId || "",
    status,
    output,
    max_output_length: maxOutputLength,
  };
}

export async function runShellCommands(
  commands,
  cwd,
  { timeoutMs, maxOutputLength, callId, signal } = {},
) {
  const steps = normalizeCommands(commands).map((command) => ({
    command,
    cwd,
    timeoutMs,
    maxOutputLength,
  }));
  return await runShellCommandSequence(steps, { callId, defaultCwd: cwd, signal });
}
