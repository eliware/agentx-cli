import { createInterface } from "node:readline/promises";
import { reloadSettings } from "./settings.mjs";
import { readEnvState } from "./setup-env.mjs";
import { getSetupPaths } from "./setup-paths.mjs";
import { selectSetupMenu } from "./setup-menu.mjs";
import { buildMenuEntries, DEFAULTS, renderScreen } from "./setup-presentation.mjs";
import { choices, editApiKey, editCompaction, editValue, labels } from "./setup-editors.mjs";

export { buildMenuEntries };

async function ask(rl, prompt) {
  return String(await rl.question(prompt));
}

export async function runSetup({
  stdin = process.stdin,
  stdout = process.stdout,
  configPath = getSetupPaths().envPath,
  readlineInput = stdin,
} = {}) {
  const envState = await readEnvState(configPath);
  envState.values = { ...DEFAULTS, ...envState.values };
  if (!stdin?.isTTY || !stdout?.isTTY) {
    stdout.write("AgentX setup requires an interactive terminal.\n");
    return;
  }
  let rl = createInterface({ input: readlineInput, output: stdout });
  let message = "";
  try {
    while (true) {
      const entries = buildMenuEntries({ values: envState.values, includeSettings: true });
      let selected = await selectSetupMenu(stdin, stdout, entries, 0, {
        rootDir: getSetupPaths().rootDir,
        envPath: configPath,
        mcpPath: getSetupPaths().mcpConfigPath,
      });
      if (!selected) {
        renderScreen({
          values: envState.values,
          message,
          stdout,
          configPath,
          mcpPath: getSetupPaths().mcpConfigPath,
        });
        entries.forEach((entry, index) => stdout.write(`${index + 1}. ${entry.label}\n`));
        stdout.write(`\nUse 1-${entries.length}, ↑/↓, or Enter.\n`);
        const choice = (await ask(rl, "\nChoose an option: ")).trim().toLowerCase();
        const index = Number(choice);
        selected =
          Number.isInteger(index) && index >= 1 && index <= entries.length
            ? entries[index - 1]
            : entries.find((entry) => entry.id === choice || entry.label.toLowerCase() === choice);
      }
      if (!selected) {
        message = "Unknown option.";
        continue;
      }
      if (selected.id === "quit") break;
      switch (selected.id) {
        case "api":
          rl.close();
          message = await editApiKey(readlineInput, envState, stdout);
          rl = createInterface({ input: readlineInput, output: stdout });
          break;
        case "model":
          await editValue(stdin, stdout, rl, envState, "AGENTX_MODEL", labels.model, choices.model);
          break;
        case "mode":
          await editValue(
            stdin,
            stdout,
            rl,
            envState,
            "AGENTX_REASONING_MODE",
            labels.mode,
            choices.mode,
          );
          break;
        case "effort":
          await editValue(
            stdin,
            stdout,
            rl,
            envState,
            "AGENTX_REASONING_EFFORT",
            labels.effort,
            choices.effort,
          );
          break;
        case "summary":
          await editValue(
            stdin,
            stdout,
            rl,
            envState,
            "AGENTX_REASONING_SUMMARY",
            labels.summary,
            choices.summary,
          );
          break;
        case "verbosity":
          await editValue(
            stdin,
            stdout,
            rl,
            envState,
            "AGENTX_OUTPUT_VERBOSITY",
            labels.verbosity,
            choices.verbosity,
          );
          break;
        case "compaction":
          await editCompaction(rl, envState, stdout);
          break;
      }
    }
  } finally {
    rl.close();
  }
  // Reload environment variables so subsequent code sees updated values.
  await reloadSettings();
}
