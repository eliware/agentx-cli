import { reloadSettings } from "./settings.mjs";
import { readEnvState } from "./setup-env.mjs";
import { getSetupPaths } from "./setup-paths.mjs";
import { selectSetupMenu } from "./setup-menu.mjs";
import { buildMenuEntries, DEFAULTS, renderReadlineMenu } from "./setup-presentation.mjs";
import { createInterface } from "node:readline/promises";
import { applySetupAction } from "./setup-action.mjs";

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
        renderReadlineMenu({
          values: envState.values,
          message,
          stdout,
          configPath,
          mcpPath: getSetupPaths().mcpConfigPath,
          entries,
        });
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
      ({ readline: rl, message } = await applySetupAction(selected.id, {
        stdin,
        stdout,
        readlineInput,
        envState,
        readline: rl,
        message,
      }));
    }
  } finally {
    rl.close();
  }
  // Reload environment variables so subsequent code sees updated values.
  await reloadSettings();
}
