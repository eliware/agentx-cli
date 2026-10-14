import { MAX_TOOL_OUTPUT } from "./tool-output.mjs";

const TRUNCATION_NOTE = "\n[output truncated]";

function normalizeLimit(value, fallback = MAX_TOOL_OUTPUT) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function truncateShellText(text, limit) {
  const string = String(text);
  const max = normalizeLimit(limit);
  if (string.length <= max) return string;
  if (max <= TRUNCATION_NOTE.length) return string.slice(0, max);
  return `${string.slice(0, max - TRUNCATION_NOTE.length)}${TRUNCATION_NOTE}`;
}

export function makeShellCommandOutput({ stdout = "", stderr, outcome, maxOutputLength }) {
  return {
    stdout: truncateShellText(stdout, maxOutputLength),
    stderr: truncateShellText(stderr, maxOutputLength),
    outcome,
  };
}

export function shellCommandFailure(stderr, maxOutputLength, exitCode) {
  return makeShellCommandOutput({
    stderr,
    outcome: { type: "exit", exit_code: exitCode },
    maxOutputLength,
  });
}

export function validateShellRequest(command, cwd, maxOutputLength) {
  if (!String(command ?? "").trim())
    return shellCommandFailure("Unable to execute an empty shell command", maxOutputLength, 2);
  if (!cwd || typeof cwd !== "string")
    return shellCommandFailure(
      "Unable to execute shell command without a working directory",
      maxOutputLength,
      2,
    );
  return null;
}
