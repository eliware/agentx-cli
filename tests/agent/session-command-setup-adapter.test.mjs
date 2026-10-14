import { expect, jest, test } from "@jest/globals";

test("builds the setup workflow adapter and reloads prompt settings", async () => {
  await jest.isolateModulesAsync(async () => {
    const runSessionSetupFlow = jest.fn(async ({ reloadTemplate }) => reloadTemplate());
    await jest.unstable_mockModule("../../src/agent/session-setup-flow.mjs", () => ({
      runSessionSetupFlow,
    }));
    const { createSessionCommandSetupAdapter } =
      await import("../../src/agent/session-command-setup-adapter.mjs");
    const services = {
      runSetup: jest.fn(),
      applySettings: jest.fn((prompt, settings) => ({ prompt, settings })),
      loadPromptTemplate: jest.fn(async () => ({ model: "loaded" })),
      reloadSettings: jest.fn(async () => ({ apiKey: "key" })),
      write: jest.fn(),
      formatMessage: jest.fn(),
      printError: jest.fn(),
    };
    const repl = {
      getReadline: jest.fn(() => "readline"),
      preserveHistory: jest.fn(),
      createReadline: jest.fn(),
      setReadline: jest.fn(),
    };
    const context = {
      promptPath: "prompt.json",
      outputFlags: { noMcp: true },
      input: "stdin",
      output: "stdout",
    };
    const runSetupFlow = createSessionCommandSetupAdapter({ services, repl, context });
    await expect(runSetupFlow()).resolves.toEqual({
      prompt: { model: "loaded" },
      settings: { apiKey: "key" },
    });
    const options = runSessionSetupFlow.mock.calls[0][0];
    expect(options).toMatchObject({
      runSetup: services.runSetup,
      input: "stdin",
      output: "stdout",
    });
    await options.reloadTemplate();
    expect(services.loadPromptTemplate).toHaveBeenCalledWith(
      "prompt.json",
      undefined,
      process.env,
      {
        loadMcp: false,
      },
    );
    expect(repl.getReadline).toHaveBeenCalledTimes(1);
  });
});
