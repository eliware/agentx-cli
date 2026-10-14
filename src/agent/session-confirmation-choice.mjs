export function resolveSessionConfirmationChoice(answer) {
  const choice = String(answer ?? "")
    .trim()
    .toLowerCase();
  if (choice === "s" || choice === "session") return "session";
  if (choice === "g" || choice === "global") return "global";
  if (choice === "y" || choice === "yes") return "approve";
  return "decline";
}
