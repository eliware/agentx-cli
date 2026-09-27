export async function runSessionRollbackFlow({
  history,
  readline,
  preserveHistory,
  promptRollback,
  applyRollback,
  saveState,
  persistCheckpoint,
  checkpointPath,
  input,
  output,
  write,
  formatMessage,
  createReadline,
  setReadline,
}) {
  preserveHistory();
  readline?.close?.();
  try {
    const selected = await promptRollback(history, { input, output });
    if (selected) {
      applyRollback(selected);
      await saveState();
      await persistCheckpoint(checkpointPath, selected);
      write(`${formatMessage(`Rolled back to ${selected.response_id}`)}\n`);
    } else if (!history.length) {
      write(`${formatMessage("No successful rollback checkpoints available.")}\n`);
    }
  } catch (error) {
    if (error?.name !== "AbortError") write(`${formatMessage(error?.message || String(error))}\n`);
  }
  setReadline(createReadline());
}
