import { getPackageVersion } from "./cli-version.mjs";
import { getSetupPaths } from "./setup-paths.mjs";

export function renderScreen({ values, message, stdout, configPath, mcpPath }) {
  const defaults = getSetupPaths();
  configPath ??= defaults.envPath;
  mcpPath ??= defaults.mcpConfigPath;
  stdout.write(`\x1b[2J\x1b[HAgentX ${getPackageVersion()} Setup\n\n`);
  stdout.write(
    `Install Path: ${defaults.rootDir}\nConfig File: ${configPath}\nMCP Config: ${mcpPath}\nAPI key: ${values.AGENTX_API_KEY ? "set" : "blank"}\n`,
  );
  if (message) stdout.write(`\n${message}\n`);
  stdout.write("\n");
}

export function renderReadlineMenu({ values, message, stdout, configPath, mcpPath, entries }) {
  renderScreen({ values, message, stdout, configPath, mcpPath });
  entries.forEach((entry, index) => stdout.write(`${index + 1}. ${entry.label}\n`));
  stdout.write(`\nUse 1-${entries.length}, ↑/↓, or Enter.\n`);
}
