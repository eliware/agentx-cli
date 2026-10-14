function commandText(call) {
  const commands = call?.action?.commands;
  return (Array.isArray(commands) ? commands : [commands])
    .map((command) => String(command ?? ""))
    .join(" && ")
    .toLowerCase()
    .trim();
}

export function requiresDestructiveConfirmation(call) {
  if (call?.type !== "shell_call") return false;
  const commands = commandText(call);
  return /\brm\s+(?:-\S*r\S*|--recursive)\b|\b(?:rmdir|shred|mkfs(?:\.\w+)?|shutdown|reboot|poweroff|halt)\b|\bdd\s+.*\b(?:of=\/dev\/|if=\/dev\/)\S*|\bterraform\s+destroy\b|\bkubectl\s+delete\b|\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-\S*f\S*\b|\bgit\s+push\s+.*--force\b|\b(?:drop\s+(?:database|table)|truncate\s+table)\b/.test(
    commands,
  );
}

export function requiresToolConfirmation(call) {
  if (call?.type !== "shell_call") return false;
  const commands = commandText(call);
  return /(^|[;&|\s])(rm|mv|cp|mkdir|rmdir|shutdown|reboot|poweroff|xe\s+vm-(create|destroy|shutdown)|snapshot)(\s|$)/.test(
    commands,
  );
}
