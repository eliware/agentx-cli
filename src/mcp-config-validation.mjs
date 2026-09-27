function configuredTools(config) {
  if (Array.isArray(config)) return config;
  if (config && Array.isArray(config.tools)) return config.tools;
  return null;
}

export function validateMcpConfig(config) {
  const tools = configuredTools(config);
  if (!tools)
    return {
      valid: false,
      tools: [],
      errors: ["config must be an array or an object with a tools array"],
    };
  const mcpTools = tools.filter((tool) => tool?.type === "mcp");
  const errors = [];
  const labels = new Set();
  for (const [index, tool] of mcpTools.entries()) {
    const prefix = `MCP tool ${index + 1}`;
    const label = String(tool?.server_label || "").trim();
    if (!label) errors.push(`${prefix}: server_label is required`);
    else if (labels.has(label)) errors.push(`${prefix}: duplicate server_label "${label}"`);
    else labels.add(label);
    let parsed;
    try {
      parsed = new URL(String(tool?.server_url || ""));
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.protocol !== "https:")
      errors.push(`${prefix} (${label || "unnamed"}): server_url must be a valid HTTPS URL`);
    const authorization =
      tool?.headers?.Authorization || tool?.headers?.authorization || tool?.authorization;
    const oauth = tool?.oauth;
    const apiKey = tool?.api_key || tool?.apiKey;
    const validAlternateAuth =
      (oauth &&
        typeof oauth === "object" &&
        typeof oauth.client_id === "string" &&
        typeof oauth.client_secret === "string") ||
      (typeof apiKey === "string" && apiKey.trim());
    if (!((typeof authorization === "string" && authorization.trim()) || validAlternateAuth))
      errors.push(`${prefix} (${label || "unnamed"}): authorization is required`);
  }
  return { valid: errors.length === 0, tools: mcpTools, errors };
}
