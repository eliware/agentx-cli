import { getPackageVersion } from "./cli-version.mjs";
import { getSetupPaths } from "./setup-paths.mjs";

export const DEFAULTS = {
  AGENTX_MODEL: "gpt-6-luna",
  AGENTX_REASONING_MODE: "standard",
  AGENTX_REASONING_EFFORT: "low",
  AGENTX_REASONING_SUMMARY: "auto",
  AGENTX_OUTPUT_VERBOSITY: "low",
  AGENTX_COMPACTION_THRESHOLD: "200000",
};

export function buildMenuEntries({ values, includeSettings = false }) {
  const configured = { ...DEFAULTS, ...values };
  if (!includeSettings && !Object.keys(values).some((key) => key !== "AGENTX_API_KEY"))
    return [
      { id: "api", label: `Edit API key (${configured.AGENTX_API_KEY ? "set" : "blank"})` },
      { id: "quit", label: "Quit" },
    ];
  return [
    { id: "api", label: `Edit API key (${configured.AGENTX_API_KEY ? "set" : "blank"})` },
    { id: "model", label: `Model (${configured.AGENTX_MODEL})` },
    { id: "mode", label: `Reasoning mode (${configured.AGENTX_REASONING_MODE})` },
    { id: "effort", label: `Reasoning effort (${configured.AGENTX_REASONING_EFFORT})` },
    { id: "summary", label: `Reasoning summary (${configured.AGENTX_REASONING_SUMMARY})` },
    { id: "verbosity", label: `Output verbosity (${configured.AGENTX_OUTPUT_VERBOSITY})` },
    {
      id: "compaction",
      label: `Compaction threshold (${configured.AGENTX_COMPACTION_THRESHOLD} tokens)`,
    },
    { id: "quit", label: "Quit" },
  ];
}

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
