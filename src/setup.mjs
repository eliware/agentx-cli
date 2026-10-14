import { reloadSettings } from "./settings.mjs";
import { readEnvState } from "./setup-env.mjs";
import { getSetupPaths } from "./setup-paths.mjs";
import { buildMenuEntries, DEFAULTS, renderReadlineMenu } from "./setup-presentation.mjs";
import { createInterface } from "node:readline/promises";
import { applySetupAction } from "./setup-action.mjs";
import { selectSetupMenuChoice } from "./setup-menu-interaction.mjs";

export { buildMenuEntries };

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
      const selected = await selectSetupMenuChoice({
        stdin,
        stdout,
        entries,
        initialIndex: 0,
        paths: {
          rootDir: getSetupPaths().rootDir,
          envPath: configPath,
          mcpPath: getSetupPaths().mcpConfigPath,
        },
        readline: rl,
        fallbackScreen: () =>
          renderReadlineMenu({
            values: envState.values,
            message,
            stdout,
            configPath,
            mcpPath: getSetupPaths().mcpConfigPath,
            entries,
          }),
      });
      if (!selected) {
        message = "Unknown option.";
        continue;
      }
      const action = await applySetupAction(selected.id, {
        stdin,
        stdout,
        readlineInput,
        envState,
        readline: rl,
        message,
      });
      if (action.quit) break;
      ({ readline: rl, message } = action);
    }
  } finally {
    rl.close();
  }
  // Reload environment variables so subsequent code sees updated values.
  await reloadSettings();
}
