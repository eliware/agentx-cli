export function toolCommandText(call) {
  const commands = call?.action?.commands;
  const values = Array.isArray(commands)
    ? commands
    : typeof commands === "string"
      ? [commands]
      : [];
  return values
    .map((command) => String(command ?? ""))
    .join(" && ")
    .toLowerCase()
    .trim();
}
