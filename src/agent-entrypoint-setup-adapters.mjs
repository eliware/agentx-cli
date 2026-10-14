import { path } from "@eliware/common";
import { existsSync } from "node:fs";
import { loadUserConfiguration } from "./env-loader.mjs";

export function createEntrypointSetupAdapters({ homeDirectory, processRef, dependencies = {} }) {
  const configFile = homeDirectory ? path(homeDirectory, ".agentx") : "";
  return {
    configured: Boolean(configFile && (dependencies.existsSync || existsSync)(configFile)),
    ask:
      dependencies.ask ||
      (async () => {
        const { askToRunSetup } = await import("./agent-entrypoint-prompt.mjs");
        return askToRunSetup({ input: processRef.stdin, output: processRef.stdout });
      }),
    runSetup:
      dependencies.runSetup ||
      (async () => {
        const { runSetup: setup } = await import("./setup.mjs");
        await setup({ stdin: processRef.stdin, stdout: processRef.stdout });
      }),
    reloadConfiguration:
      dependencies.reloadConfiguration ||
      (async () => {
        const { setupPaths } = await import("./setup-paths.mjs");
        loadUserConfiguration(setupPaths.envPath, { override: true });
      }),
  };
}
