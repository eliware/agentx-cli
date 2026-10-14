export async function loadAgentEntrypointDependencies() {
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
    runEntrypointSetup: setup.runEntrypointSetup,
  };
}
