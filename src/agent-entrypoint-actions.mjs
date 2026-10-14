import { path } from "@eliware/common";

export function runEntrypointAction(parsed, { homeDirectory, stdout, processRef, dependencies }) {
  const { formatQuickHelp } = dependencies;
  const { getPackageVersion } = dependencies;
  const { formatMcpConfigValidation } = dependencies;
  const { validateMcpConfigFile } = dependencies;
  let text;
  let code = 0;
  if (parsed.flags.help) text = formatQuickHelp();
  else if (parsed.flags.version) text = getPackageVersion();
  else if (parsed.flags.checkMcp) {
    const mcpPath = path(homeDirectory || processRef.cwd(), ".agentx.mcp.json");
    const result = validateMcpConfigFile(mcpPath);
    text = formatMcpConfigValidation(result);
    code = result.valid ? 0 : 1;
  } else return false;
  stdout.write(`${text}\n`);
  processRef.exit(code);
  return true;
}
