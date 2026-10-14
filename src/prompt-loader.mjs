import { path } from "@eliware/common";
import { homedir } from "node:os";
import { readJson } from "./runtime-files.mjs";
import { getHomeDirectory } from "./platform.mjs";
import { filterWorkerTools } from "./prompt-tools.mjs";

export async function loadPromptTemplate(
  promptPath,
  mcpPath = path(getHomeDirectory() || homedir(), ".agentx.mcp.json"),
  env = process.env,
  { loadMcp = true } = {},
) {
  try {
    const template = await readJson(promptPath);
    let mcpTools = null;
    if (loadMcp) {
      try {
        const configuredTools = await readJson(mcpPath);
        const configuredEntries = Array.isArray(configuredTools)
          ? configuredTools
          : configuredTools?.tools || [];
        mcpTools = configuredEntries
          .filter((tool) => tool?.type !== "mcp" || tool.enabled !== false)
          .map((tool) => {
            if (tool?.type !== "mcp" || !Object.hasOwn(tool, "enabled")) return tool;
            const { enabled: _enabled, ...requestTool } = tool;
            return requestTool;
          });
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    const merged =
      mcpTools === null
        ? template
        : { ...template, tools: [...(template.tools || []), ...mcpTools] };
    return filterWorkerTools(merged, env);
  } catch (error) {
    throw new Error(
      `Unable to read prompt template at ${promptPath}: ${error?.message || String(error)}`,
    );
  }
}
