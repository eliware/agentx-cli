import { API_PRICING } from "@eliware/openai";
import { writeEnvState } from "./setup-env.mjs";
import { askMasked } from "./setup-menu.mjs";
import { selectChoice } from "./setup-choice.mjs";
export { selectChoice } from "./setup-choice.mjs";

const ask = async (rl, prompt) => String(await rl.question(prompt));

export const choices = {
  model: Object.keys(API_PRICING),
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
