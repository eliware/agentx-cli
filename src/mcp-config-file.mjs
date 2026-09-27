import { readFileSync } from "node:fs";
import { validateMcpConfig } from "./mcp-config-validation.mjs";

export function validateMcpConfigFile(filePath, readFile = readFileSync) {
  try {
    const config = JSON.parse(readFile(filePath, "utf8"));
    return { ...validateMcpConfig(config), exists: true, filePath };
  } catch (error) {
    if (error?.code === "ENOENT")
      return { valid: true, exists: false, tools: [], errors: [], filePath };
    return {
      valid: false,
      exists: true,
      tools: [],
      errors: [`unable to read config: ${error?.message || String(error)}`],
      filePath,
    };
  }
}
