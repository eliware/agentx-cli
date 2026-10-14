import { reportEntrypointError } from "./agent-entrypoint-error.mjs";

async function loadDependencies() {
  const [runtime, agent, help, version, args, mcpFormat, mcpFile, actions, config, setup] =
    await Promise.all([
      import("./runtime.mjs"),
      import("./agent/runtime.mjs"),
      import("./cli-help.mjs"),
      import("./cli-version.mjs"),
      import("./cli-args.mjs"),
      import("./mcp-config-format.mjs"),
      import("./mcp-config-file.mjs"),
      import("./agent-entrypoint-actions.mjs"),
      import("./agent-entrypoint-config.mjs"),
      import("./agent-entrypoint-setup.mjs"),
    ]);
  return {
    isDirectInvocation: runtime.isDirectInvocation,
    promptPath: runtime.promptPath,
    runAgent: agent.runAgent,
    formatQuickHelp: help.formatQuickHelp,
    getPackageVersion: version.getPackageVersion,
    parseCliArgs: args.parseCliArgs,
    formatMcpConfigValidation: mcpFormat.formatMcpConfigValidation,
    validateMcpConfigFile: mcpFile.validateMcpConfigFile,
    runEntrypointAction: actions.runEntrypointAction,
    prepareAgentStartup: config.prepareAgentStartup,
    readEnvState: (await import("./setup-env.mjs")).readEnvState,
    runEntrypointSetup: setup.runEntrypointSetup,
  };
}

export async function bootstrapAgentEntrypoint({
  homeDirectory,
  moduleUrl,
  argv = process.argv.slice(2),
  processRef = process,
  dependencies,
} = {}) {
  const services = dependencies || (await loadDependencies());
  if (!services.isDirectInvocation(moduleUrl)) return;
  const parsed = services.parseCliArgs(argv);
  const handled = services.runEntrypointAction(parsed, {
    homeDirectory,
    stdout: processRef.stdout,
    processRef,
    dependencies: services,
  });
  if (handled) return;
  try {
    const { cwd, messageArgs } = await services.prepareAgentStartup(parsed, {
      readEnvState: services.readEnvState,
      env: processRef.env,
      cwd: processRef.cwd(),
    });
    if (!messageArgs.length) await services.runEntrypointSetup({ homeDirectory, processRef });
    await services.runAgent({
      promptPath: services.promptPath,
      cwd,
      flags: parsed.flags,
      ...(messageArgs.length ? { initialMessage: messageArgs.join(" "), oneShot: true } : {}),
    });
  } catch (error) {
    reportEntrypointError(error, processRef);
  }
}
