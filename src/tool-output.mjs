export const MAX_TOOL_OUTPUT = 100_000;
const TRUNCATED_TOOL_OUTPUT = 10_000;

export function truncateToolOutput(text) {
  if (text.length <= MAX_TOOL_OUTPUT) return text;
  return `${text.slice(0, TRUNCATED_TOOL_OUTPUT)}\n\n[output truncated: results were too long. Send a command with less output or read the file in smaller pieces.]`;
}
