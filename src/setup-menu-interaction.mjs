import { selectSetupMenu } from "./setup-menu.mjs";

export function buildChoiceEntries(valuesList, current) {
  return valuesList.map((value) => ({
    id: value,
    label: `${value}${value === current ? " (current)" : ""}`,
  }));
}

export function matchChoice(entries, answer) {
  const index = Number(answer);
  if (Number.isInteger(index) && index >= 1 && index <= entries.length)
    return entries[index - 1].id;
  return (
    entries.find(
      (entry) =>
        entry.id === answer ||
        entry.id.startsWith(answer) ||
        entry.label.toLowerCase().startsWith(answer.toLowerCase()),
    )?.id ?? null
  );
}

export async function selectSetupMenuChoice({
  stdin,
  stdout,
  entries,
  initialIndex,
  paths,
  readline,
  fallbackScreen,
}) {
  const selected = await selectSetupMenu(stdin, stdout, entries, initialIndex, paths);
  if (selected) return selected;
  fallbackScreen();
  return selectReadlineMenuChoice(readline, entries);
}

export async function selectReadlineMenuChoice(rl, entries) {
  const choice = String(await rl.question("\nChoose an option: "))
    .trim()
    .toLowerCase();
  const index = Number(choice);
  if (Number.isInteger(index) && index >= 1 && index <= entries.length) return entries[index - 1];
  return entries.find((entry) => entry.id === choice || entry.label.toLowerCase() === choice);
}
