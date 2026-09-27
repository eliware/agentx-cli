import { config } from "dotenv";

export function loadUserConfiguration(configPath, options = {}) {
  if (!configPath) return;
  return config({ path: configPath, quiet: true, ...options });
}
