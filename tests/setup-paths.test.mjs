import { describe, expect, jest, test } from "@jest/globals";
import { getSetupPaths, setupPaths } from "../src/setup-paths.mjs";

describe("setup path resolution", () => {
  test("resolves user configuration paths from the current home environment", () => {
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = "C:/agentx-user-a";
      const first = getSetupPaths();
      expect(first.envPath).toContain(".agentx");
      expect(first.mcpConfigPath).toContain(".agentx.mcp.json");
      expect(first.rootDir).toBe(setupPaths.rootDir);
      process.env.HOME = "C:/agentx-user-b";
      expect(getSetupPaths().envPath).not.toBe(first.envPath);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  test("falls back to the user profile when no home directory is available", async () => {
    jest.resetModules();
    await jest.unstable_mockModule("../src/platform.mjs", () => ({ getHomeDirectory: () => "" }));
    await jest.isolateModulesAsync(async () => {
      const { setupPaths: fallbackPaths } = await import("../src/setup-paths.mjs");
      expect(fallbackPaths.envPath).toContain(".agentx");
      expect(fallbackPaths.mcpConfigPath).toContain(".agentx.mcp.json");
    });
  });
});
