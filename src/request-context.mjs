function formatShellCommandOutput(output) {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const stdout = String(output.stdout ?? "").trimEnd();
    const stderr = String(output.stderr ?? "").trimEnd();
    const parts = [];
    if (stdout) parts.push(stdout);
    if (stderr) parts.push(stdout ? `stderr:\n${stderr}` : stderr);
    return parts.join("\n\n").trimEnd();
  }
  return String(output ?? "").trimEnd();
}

export function appendCliTranscript(existingTranscript, command, outputText) {
  const entry = [`! ${command}`];
  const trimmedOutput = formatShellCommandOutput(outputText);
  if (trimmedOutput) entry.push(trimmedOutput);
  return [existingTranscript, entry.join("\n")].filter(Boolean).join("\n\n");
}

export function buildRequestMessage({ pendingCliTranscript, cwdNote, message }) {
  const contextParts = [];
  if (pendingCliTranscript) {
    contextParts.push(
      `Local shell commands and output since the last assistant message:\n\n${pendingCliTranscript}`,
    );
  }
  if (cwdNote) contextParts.push(cwdNote);
  contextParts.push(message);
  return contextParts.join("\n\n");
}
