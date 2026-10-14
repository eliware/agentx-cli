#!/usr/bin/env node
import { path } from "@eliware/common";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { loadEntrypointEnvironment } from "./agent-entrypoint-env.mjs";
import { loadUserConfiguration } from "./env-loader.mjs";

const homeDirectory = loadEntrypointEnvironment();

const { isDirectInvocation, promptPath } = await import("./runtime.mjs");
const { runAgent } = await import("./agent/runtime.mjs");
const { formatQuickHelp } = await import("./cli-help.mjs");
const { getPackageVersion } = await import("./cli-version.mjs");
const { parseCliArgs } = await import("./cli-args.mjs");
const { formatMcpConfigValidation } = await import("./mcp-config-format.mjs");
const { validateMcpConfigFile } = await import("./mcp-config-file.mjs");
const { runEntrypointAction } = await import("./agent-entrypoint-actions.mjs");
const { prepareAgentStartup } = await import("./agent-entrypoint-config.mjs");

async function askToRunSetup() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question("AgentX is not configured. Run agentx-setup now? [Y/n] ");
  } finally {
    rl.close();
  }
}

async function confirmSetup() {
  const configFile = homeDirectory ? path(homeDirectory, ".agentx") : "";
  const { confirmSetup: runSetupPrompt } = await import("./agent-entrypoint-setup.mjs");
  return runSetupPrompt({
    isTest: process.env.NODE_ENV === "test",
    isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    configured: Boolean(configFile && existsSync(configFile)),
    hasApiKey: () => Boolean(process.env.agentx_api_key || process.env.AGENTX_API_KEY),
    ask: askToRunSetup,
    runSetup: async () => {
      const { runSetup } = await import("./setup.mjs");
      await runSetup({ stdin: process.stdin, stdout: process.stdout });
    },
    reloadConfiguration: async () => {
      const { setupPaths } = await import("./setup-paths.mjs");
      loadUserConfiguration(setupPaths.envPath, { override: true });
    },
  });
}

function printStartupError(error) {
  process.stderr.write(`${error?.message || String(error)}\n`);
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  const parsed = parseCliArgs(argv);
  const handled = runEntrypointAction(parsed, {
    homeDirectory,
    stdout: process.stdout,
    processRef: process,
    dependencies: {
      formatQuickHelp,
      getPackageVersion,
      formatMcpConfigValidation,
      validateMcpConfigFile,
    },
  });
  if (!handled) {
    try {
      const { readEnvState } = await import("./setup-env.mjs");
      const { cwd, messageArgs } = await prepareAgentStartup(parsed, {
        readEnvState,
        env: process.env,
        cwd: process.cwd(),
      });
      if (!messageArgs.length) await confirmSetup();
      await runAgent({
        promptPath,
        cwd,
        flags: parsed.flags,
        ...(messageArgs.length ? { initialMessage: messageArgs.join(" "), oneShot: true } : {}),
      });
    } catch (error) {
      printStartupError(error);
      process.exitCode = 1;
    }
  }
}
