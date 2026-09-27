import { getPackageVersion } from "./cli-version.mjs";
import { writeEnvState } from "./setup-env.mjs";
import { getSetupPaths } from "./setup-paths.mjs";
import { askMasked, selectSetupMenu } from "./setup-menu.mjs";

const ask = async (rl, prompt) => String(await rl.question(prompt));

export const choices = {
  model: ["gpt-6-luna", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
  mode: ["standard", "pro"],
  effort: ["none", "low", "medium", "high", "xhigh", "max"],
  summary: ["concise", "detailed", "auto", "null"],
  verbosity: ["low", "medium", "high"],
};

export const labels = {
  model: "Model",
  mode: "Reasoning mode",
  effort: "Reasoning effort",
  summary: "Reasoning summary",
  verbosity: "Output verbosity",
};

async function saveEnvValue(envState, key, value) {
  envState.values[key] = value;
  envState.text = await writeEnvState(envState.filePath, envState.values, envState.text);
}

export async function selectChoice(stdin, stdout, rl, title, valuesList, current) {
  const entries = valuesList.map((value) => ({
    id: value,
    label: `${value}${value === current ? " (current)" : ""}`,
  }));
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
  const answer = (await ask(rl, `${title} (1-${entries.length}) [${current}]: `)).trim();
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

export async function editValue(stdin, stdout, rl, envState, key, label, valuesList) {
  const value = await selectChoice(stdin, stdout, rl, label, valuesList, envState.values[key]);
  if (value && value !== envState.values[key]) await saveEnvValue(envState, key, value);
}

export async function editApiKey(input, envState, stdout) {
  const current = String(envState.values.AGENTX_API_KEY || "");
  const suffix = current ? `********${current.slice(-8)}` : "(blank)";
  while (true) {
    const answer = (await askMasked(input, stdout, `API key [${suffix}]: `, current)).trim();
    const next = answer || current;
    if (!next) {
      stdout.write("API key is required.\n");
      continue;
    }
    await saveEnvValue(envState, "AGENTX_API_KEY", next);
    stdout.write("API key saved.\n");
    return "API key saved.";
  }
}

export async function editCompaction(rl, envState, stdout) {
  const input = (
    await ask(rl, `Compaction threshold tokens [${envState.values.AGENTX_COMPACTION_THRESHOLD}]: `)
  ).trim();
  if (!input) return;
  const value = Number(input.replaceAll(/[^0-9]/g, ""));
  if (!Number.isInteger(value) || value < 1) {
    stdout.write("Enter a positive token count.\n");
    return;
  }
  await saveEnvValue(envState, "AGENTX_COMPACTION_THRESHOLD", String(value));
  if (value > 270000) stdout.write("Warning: jumbo prompts cost 2x above 270k tokens.\n");
}
