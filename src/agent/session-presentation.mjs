export function presentAgentSession({
  outputFlags,
  savedState,
  savedResponseId,
  restoredSession,
  agentsText,
  oneShot,
  settings,
  formatSystemMessage,
  write,
  printResumeMessage,
}) {
  if (!outputFlags.quiet) write(`${settings}\n`);
  if (!outputFlags.quiet && !agentsText)
    write(
      `${formatSystemMessage("AGENTS.md not found; ask AgentX to generate one for this project.")}\n`,
    );
  if (!outputFlags.quiet)
    write(
      `${formatSystemMessage(savedResponseId ? `${oneShot ? "Branching from checkpoint" : "Resuming conversation"} ${savedResponseId}` : "Starting new session")}\n`,
    );
  if (!oneShot) {
    printResumeMessage("Last user message", savedState?.last_user_message || "");
    printResumeMessage("Last assistant message", savedState?.last_assistant_message || "");
  }

  if (savedState?.failed_response) {
    const message = restoredSession.hasPendingTransaction
      ? "Previous continuation failed; pending tool transaction preserved for recovery."
      : "Previous request failed; starting from the last successful checkpoint.";
    write(`${formatSystemMessage(message)}\n`);
  }
  if (restoredSession.activeGoal?.status === "paused" && !oneShot)
    write(
      `${formatSystemMessage(`Paused goal: ${restoredSession.activeGoal.text}. Use /goal resume to continue.`)}\n`,
    );
}
