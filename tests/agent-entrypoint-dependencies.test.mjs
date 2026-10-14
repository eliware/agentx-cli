import { expect, jest, test } from "@jest/globals";

const modules = {
  runtime: { isDirectInvocation: jest.fn(), promptPath: "prompt" },
  agent: { runAgent: jest.fn() },
  help: { formatQuickHelp: jest.fn() },
  version: { getPackageVersion: jest.fn() },
  args: { parseCliArgs: jest.fn() },
  format: { formatMcpConfigValidation: jest.fn() },
  file: { validateMcpConfigFile: jest.fn() },
  actions: { runEntrypointAction: jest.fn() },
  config: { prepareAgentStartup: jest.fn() },
  setup: { runEntrypointSetup: jest.fn() },
};

test("loads and maps entrypoint dependencies", async () => {
  await jest.isolateModulesAsync(async () => {
    await jest.unstable_mockModule("../src/runtime.mjs", () => modules.runtime);
    await jest.unstable_mockModule("../src/agent/runtime.mjs", () => modules.agent);
    await jest.unstable_mockModule("../src/cli-help.mjs", () => modules.help);
    await jest.unstable_mockModule("../src/cli-version.mjs", () => modules.version);
    await jest.unstable_mockModule("../src/cli-args.mjs", () => modules.args);
    await jest.unstable_mockModule("../src/mcp-config-format.mjs", () => modules.format);
    await jest.unstable_mockModule("../src/mcp-config-file.mjs", () => modules.file);
    await jest.unstable_mockModule("../src/agent-entrypoint-actions.mjs", () => modules.actions);
    await jest.unstable_mockModule("../src/agent-entrypoint-config.mjs", () => modules.config);
    await jest.unstable_mockModule("../src/agent-entrypoint-setup.mjs", () => modules.setup);
    const { loadAgentEntrypointDependencies } =
      await import("../src/agent-entrypoint-dependencies.mjs");
    await expect(loadAgentEntrypointDependencies()).resolves.toEqual({
      isDirectInvocation: modules.runtime.isDirectInvocation,
      promptPath: "prompt",
      runAgent: modules.agent.runAgent,
      formatQuickHelp: modules.help.formatQuickHelp,
      getPackageVersion: modules.version.getPackageVersion,
      parseCliArgs: modules.args.parseCliArgs,
      formatMcpConfigValidation: modules.format.formatMcpConfigValidation,
      validateMcpConfigFile: modules.file.validateMcpConfigFile,
      runEntrypointAction: modules.actions.runEntrypointAction,
      prepareAgentStartup: modules.config.prepareAgentStartup,
      runEntrypointSetup: modules.setup.runEntrypointSetup,
    });
  });
});
