export function resolvePendingSessionChoice(choice) {
  if (choice === "new-session") return { action: "abandon" };
  const notice =
    choice === "auto-resume"
      ? "Resuming pending tool execution"
      : choice === "interrupt-retry"
        ? "Resuming pending tool execution with retry hint"
        : "Resuming pending tool execution with interruption notice";
  return { action: "resume", notice };
}
