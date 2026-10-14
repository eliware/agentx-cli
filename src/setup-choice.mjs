import { getPackageVersion } from "./cli-version.mjs";
import { getSetupPaths } from "./setup-paths.mjs";
import { selectSetupMenu } from "./setup-menu.mjs";
import { buildChoiceEntries, matchChoice } from "./setup-menu-interaction.mjs";

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
