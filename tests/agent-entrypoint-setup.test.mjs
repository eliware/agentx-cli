import { describe, expect, jest, test } from "@jest/globals";
import { runEntrypointSetup } from "../src/agent-entrypoint-setup.mjs";

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

  test("does not run setup when the user declines", async () => {
    const runSetup = jest.fn();
    await expect(
      runEntrypointSetup({
        processRef: {
          env: { NODE_ENV: "production" },
          stdin: { isTTY: true },
          stdout: { isTTY: true },
        },
        dependencies: { ask: async () => "no", runSetup },
      }),
    ).resolves.toBe(false);
    expect(runSetup).not.toHaveBeenCalled();
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
});
