export async function selectReadlineMenuChoice(rl, entries) {
  const choice = String(await rl.question("\nChoose an option: "))
    .trim()
    .toLowerCase();
  const index = Number(choice);
  if (Number.isInteger(index) && index >= 1 && index <= entries.length) return entries[index - 1];
  return entries.find((entry) => entry.id === choice || entry.label.toLowerCase() === choice);
}
