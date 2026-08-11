import { readFileSync } from 'node:fs';

function configuredTools(config) {
  if (Array.isArray(config)) return config;
  if (config && Array.isArray(config.tools)) return config.tools;
  return null;
}

export function validateMcpConfig(config) {
  const tools = configuredTools(config);
  if (!tools) return { valid: false, tools: [], errors: ['config must be an array or an object with a tools array'] };
  const mcpTools = tools.filter((tool) => tool?.type === 'mcp');
  const errors = [];
  const labels = new Set();
  for (const [index, tool] of mcpTools.entries()) {
    const prefix = `MCP tool ${index + 1}`;
    const label = String(tool?.server_label || '').trim();
    if (!label) errors.push(`${prefix}: server_label is required`);
    else if (labels.has(label)) errors.push(`${prefix}: duplicate server_label "${label}"`);
    else labels.add(label);
    let parsed;
    try { parsed = new URL(String(tool?.server_url || '')); } catch { parsed = null; }
    if (!parsed || parsed.protocol !== 'https:') errors.push(`${prefix} (${label || 'unnamed'}): server_url must be a valid HTTPS URL`);
    const authorization = tool?.headers?.Authorization || tool?.headers?.authorization || tool?.authorization;
    if (typeof authorization !== 'string' || !authorization.trim()) errors.push(`${prefix} (${label || 'unnamed'}): authorization is required`);
  }
  return { valid: errors.length === 0, tools: mcpTools, errors };
}

export function validateMcpConfigFile(filePath, readFile = readFileSync) {
  try {
    const config = JSON.parse(readFile(filePath, 'utf8'));
    return { ...validateMcpConfig(config), exists: true, filePath };
  } catch (error) {
    if (error?.code === 'ENOENT') return { valid: true, exists: false, tools: [], errors: [], filePath };
    return { valid: false, exists: true, tools: [], errors: [`unable to read config: ${error?.message || String(error)}`], filePath };
  }
}

export function formatMcpConfigValidation(result) {
  if (!result.exists) return `MCP config not found: ${result.filePath}`;
  if (!result.valid) return [`MCP config invalid: ${result.filePath}`, ...result.errors.map(error => `- ${error}`)].join('\n');
  if (result.tools.length === 0) return `MCP config valid: no MCP tools configured (${result.filePath})`;
  return [`MCP config valid: ${result.tools.length} MCP tool${result.tools.length === 1 ? '' : 's'} configured`, ...result.tools.map(tool => `- ${tool.server_label}: ${tool.server_url} (authorization present)`)].join('\n');
}
