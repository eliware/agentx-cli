import { describe, expect, jest, test } from "@jest/globals";
import { confirmSetup } from "../src/agent-entrypoint-setup.mjs";

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
