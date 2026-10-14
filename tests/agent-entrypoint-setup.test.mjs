import { describe, expect, jest, test } from "@jest/globals";
import { confirmSetup, runEntrypointSetup } from "../src/agent-entrypoint-setup.mjs";

function options(overrides = {}) {
  return {
    isTest: false,
    isTty: true,
    configured: false,
    hasApiKey: () => false,
    ask: jest.fn(async () => "yes"),
    runSetup: jest.fn(),
    reloadConfiguration: jest.fn(),
    ...overrides,
  };
}

describe("entrypoint setup prompt", () => {
  test("uses default process values when setup input is omitted", async () => {
    await expect(runEntrypointSetup()).resolves.toBe(false);
  });

  test("checks the default settings path without a terminal", async () => {
    await expect(
      runEntrypointSetup({
        homeDirectory: "/workspace/home",
        processRef: {
          env: { NODE_ENV: "production" },
          stdin: { isTTY: false },
          stdout: { isTTY: false },
        },
      }),
    ).resolves.toBe(false);
  });

  test("loads setup adapters and reloads configuration after setup", async () => {
    const events = [];
    const processRef = {
      env: { NODE_ENV: "production", AGENTX_API_KEY: "" },
      stdin: { isTTY: true },
      stdout: { isTTY: true },
    };
    await expect(
      runEntrypointSetup({
        homeDirectory: "/workspace/home",
        processRef,
        dependencies: {
          existsSync: jest.fn(() => true),
          ask: jest.fn(async () => "yes"),
          runSetup: jest.fn(async () => events.push("setup")),
          reloadConfiguration: jest.fn(() => {
            events.push("reload");
            processRef.env.AGENTX_API_KEY = "configured";
          }),
        },
      }),
    ).resolves.toBe(true);
    expect(events).toEqual(["setup", "reload"]);
  });

  test("accepts the lower-case API key environment variable", async () => {
    const processRef = {
      env: { NODE_ENV: "production", agentx_api_key: "configured" },
      stdin: { isTTY: true },
      stdout: { isTTY: true },
    };
    await expect(
      runEntrypointSetup({
        processRef,
        homeDirectory: "/workspace/home",
        dependencies: {
          existsSync: () => true,
        },
      }),
    ).resolves.toBe(false);
  });

  test("accepts the upper-case API key environment variable", async () => {
    const processRef = {
      env: { NODE_ENV: "production", AGENTX_API_KEY: "configured" },
      stdin: { isTTY: true },
      stdout: { isTTY: true },
    };
    await expect(
      runEntrypointSetup({
        processRef,
        homeDirectory: "/workspace/home",
        dependencies: { existsSync: () => true },
      }),
    ).resolves.toBe(false);
  });

  test("skips the prompt in tests, without a TTY, or with a configured key", async () => {
    for (const overrides of [
      { isTest: true },
      { isTty: false },
      { configured: true, hasApiKey: () => true },
    ]) {
      const setup = options(overrides);
      await expect(confirmSetup(setup)).resolves.toBe(false);
      expect(setup.ask).not.toHaveBeenCalled();
      expect(setup.runSetup).not.toHaveBeenCalled();
    }
  });

  test("continues without setup when the user declines", async () => {
    const setup = options({ ask: jest.fn(async () => " N ") });
    await expect(confirmSetup(setup)).resolves.toBe(false);
    expect(setup.runSetup).not.toHaveBeenCalled();
    expect(setup.reloadConfiguration).not.toHaveBeenCalled();
  });

  test("runs setup, reloads settings, then checks for an API key", async () => {
    const events = [];
    const setup = options({
      configured: true,
      ask: jest.fn(async () => " Y "),
      runSetup: jest.fn(async () => events.push("setup")),
      reloadConfiguration: jest.fn(async () => events.push("reload")),
      hasApiKey: jest.fn(() => {
        events.push("key");
        return events.includes("reload");
      }),
    });
    await expect(confirmSetup(setup)).resolves.toBe(true);
    expect(events).toEqual(["key", "setup", "reload", "key"]);
  });

  test("accepts an empty answer and returns false when setup adds no API key", async () => {
    const setup = options({ ask: jest.fn(async () => "") });
    await expect(confirmSetup(setup)).resolves.toBe(false);
    expect(setup.runSetup).toHaveBeenCalledTimes(1);
    expect(setup.reloadConfiguration).toHaveBeenCalledTimes(1);
  });
});
