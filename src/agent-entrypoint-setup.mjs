import { path } from "@eliware/common";
import { existsSync } from "node:fs";
import { loadUserConfiguration } from "./env-loader.mjs";

export async function confirmSetup({
  isTest,
  isTty,
  configured,
  hasApiKey,
  ask,
  runSetup,
  reloadConfiguration,
}) {
  if (isTest || !isTty || (configured && hasApiKey())) return false;
  const answer = (await ask()).trim().toLowerCase();
  if (answer && answer !== "y" && answer !== "yes") return false;
  await runSetup();
  await reloadConfiguration();
  return hasApiKey();
}

export async function runEntrypointSetup({
  homeDirectory,
  processRef = process,
  dependencies = {},
} = {}) {
  const configFile = homeDirectory ? path(homeDirectory, ".agentx") : "";
  const ask =
    dependencies.ask ||
    (async () => {
      const { askToRunSetup } = await import("./agent-entrypoint-prompt.mjs");
      return askToRunSetup({ input: processRef.stdin, output: processRef.stdout });
    });
  const runSetup =
    dependencies.runSetup ||
    (async () => {
      const { runSetup: setup } = await import("./setup.mjs");
      await setup({ stdin: processRef.stdin, stdout: processRef.stdout });
    });
  const reloadConfiguration =
    dependencies.reloadConfiguration ||
    (async () => {
      const { setupPaths } = await import("./setup-paths.mjs");
      loadUserConfiguration(setupPaths.envPath, { override: true });
    });
  return confirmSetup({
    isTest: processRef.env.NODE_ENV === "test",
    isTty: Boolean(processRef.stdin.isTTY && processRef.stdout.isTTY),
    configured: Boolean(configFile && (dependencies.existsSync || existsSync)(configFile)),
    hasApiKey: () => Boolean(processRef.env.agentx_api_key || processRef.env.AGENTX_API_KEY),
    ask,
    runSetup,
    reloadConfiguration,
  });
}
