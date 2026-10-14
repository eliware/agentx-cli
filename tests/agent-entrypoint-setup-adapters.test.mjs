import { expect, jest, test } from "@jest/globals";
import { path } from "@eliware/common";
import { createEntrypointSetupAdapters } from "../src/agent-entrypoint-setup-adapters.mjs";

test("resolves the config path and keeps injected setup adapters", async () => {
  const processRef = { stdin: "input", stdout: "output" };
  const ask = jest.fn(async () => "yes");
  const runSetup = jest.fn();
  const reloadConfiguration = jest.fn();
  const existsSync = jest.fn(() => true);
  const adapters = createEntrypointSetupAdapters({
    homeDirectory: "/workspace/home",
    processRef,
    dependencies: { ask, runSetup, reloadConfiguration, existsSync },
  });
  expect(existsSync).toHaveBeenCalledWith(path("/workspace/home", ".agentx"));
  expect(adapters.configured).toBe(true);
  expect(adapters.ask).toBe(ask);
  expect(adapters.runSetup).toBe(runSetup);
  expect(adapters.reloadConfiguration).toBe(reloadConfiguration);
});

test("does not check a config path when the home directory is absent", () => {
  const adapters = createEntrypointSetupAdapters({
    processRef: { stdin: {}, stdout: {} },
  });
  expect(adapters.configured).toBe(false);
});
