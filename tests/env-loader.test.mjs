import { beforeEach, describe, expect, jest as testMocks, test } from "@jest/globals";

testMocks.unstable_mockModule("dotenv", () => ({ config: testMocks.fn(() => "loaded") }));

const { loadUserConfiguration } = await import("../src/env-loader.mjs");
const { config } = await import("dotenv");

describe("user configuration loader", () => {
  beforeEach(() => config.mockClear());

  test("loads the requested file quietly", () => {
    expect(loadUserConfiguration("/config/.agentx")).toBe("loaded");
    expect(config).toHaveBeenCalledWith({ path: "/config/.agentx", quiet: true });
  });

  test("applies explicit dotenv options", () => {
    loadUserConfiguration("/config/.agentx", { override: true });
    expect(config).toHaveBeenCalledWith({
      path: "/config/.agentx",
      quiet: true,
      override: true,
    });
  });

  test("does not load when the config path is absent", () => {
    expect(loadUserConfiguration("")).toBeUndefined();
    expect(config).not.toHaveBeenCalled();
  });
});
