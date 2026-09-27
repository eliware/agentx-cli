import { path } from "@eliware/common";
import { getHomeDirectory } from "./platform.mjs";

const rootDir = path(import.meta, "..");

export function getSetupPaths() {
  const homeDirectory = getHomeDirectory();
  return {
    rootDir,
    envPath: path(homeDirectory || rootDir, ".agentx"),
    mcpConfigPath: path(homeDirectory || rootDir, ".agentx.mcp.json"),
  };
}

export const setupPaths = {
  get rootDir() {
    return getSetupPaths().rootDir;
  },
  get envPath() {
    return getSetupPaths().envPath;
  },
  get mcpConfigPath() {
    return getSetupPaths().mcpConfigPath;
  },
};
