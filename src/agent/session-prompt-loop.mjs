export async function runSessionPromptLoop({
  oneShot,
  initialMessage,
  readPrompt,
  handlePromptError,
  dispatchInput,
  processMessage,
}) {
  let pendingMessage = oneShot ? String(initialMessage ?? "") : null;
  for (;;) {
    let line;
    try {
      line = pendingMessage === null ? await readPrompt() : pendingMessage;
      pendingMessage = null;
    } catch (error) {
      const action = await handlePromptError(error);
      if (action === "continue") continue;
      if (action === "return") return;
      throw new Error(`Unsupported prompt error action: ${String(action)}`);
    }

    const command = await dispatchInput(line);
    if (command.action === "exit") return;
    if (command.action === "continue") continue;
    const action = await processMessage(command.message);
    if (action === "exit") return;
  }
}
