import { getPackageVersion } from "./cli-version.mjs";
import { getSetupPaths } from "./setup-paths.mjs";
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

export async function selectChoice(stdin, stdout, rl, title, valuesList, current) {
  const entries = buildChoiceEntries(valuesList, current);
  stdout.write(`\x1b[2J\x1b[HAgentX ${getPackageVersion()} Setup\n\n${title}\n`);
  const currentIndex = entries.findIndex((entry) => entry.id === current);
  const defaults = getSetupPaths();
  const selected = await selectSetupMenu(
    stdin,
    stdout,
    entries,
    currentIndex >= 0 ? currentIndex : 0,
    { rootDir: defaults.rootDir, envPath: defaults.envPath },
  );
  if (selected) return selected.id;
  const answer = String(await rl.question(`${title} (1-${entries.length}) [${current}]: `)).trim();
  return matchChoice(entries, answer);
}
