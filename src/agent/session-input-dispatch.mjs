export async function dispatchSessionInput({
  message,
  cwd,
  input,
  readline,
  oneShot,
  state,
  deps,
}) {
  const trimmed = message.trim();
  if (!trimmed) return { action: "continue" };
  if (trimmed.startsWith("!")) {
    const command = trimmed.slice(1).trim();
    if (!command) return { action: "continue" };
    const result = await deps.executeLocalShellCommand({
      command,
      cwd,
      input: oneShot ? null : input,
      readline,
      preserveHistory: deps.preserveHistory,
      replaceReadline: deps.replaceReadline,
      reportInterruption: () => deps.writeSystem("User interrupted command (Ctrl-C)"),
    });
    state.pendingCliTranscript = deps.appendCliTranscript(
      state.pendingCliTranscript,
      command,
      result,
    );
    await deps.saveState();
    return { action: "continue" };
  }
  return deps.dispatchCommand(trimmed);
}
