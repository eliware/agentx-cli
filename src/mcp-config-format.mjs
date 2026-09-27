export function formatMcpConfigValidation(result) {
  if (!result.exists) return `MCP config not found: ${result.filePath}`;
  if (!result.valid)
    return [
      `MCP config invalid: ${result.filePath}`,
      ...result.errors.map((error) => `- ${error}`),
    ].join("\n");
  if (result.tools.length === 0)
    return `MCP config valid: no MCP tools configured (${result.filePath})`;
  return [
    `MCP config valid: ${result.tools.length} MCP tool${result.tools.length === 1 ? "" : "s"} configured`,
    ...result.tools.map(
      (tool) => `- ${tool.server_label}: ${tool.server_url} (authorization present)`,
    ),
  ].join("\n");
}
