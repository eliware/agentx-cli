import { describe, expect, jest, test } from "@jest/globals";
import { getPackageVersion } from "../src/cli-version.mjs";

describe("CLI package version", () => {
  test("reads the package version", () => {
    expect(getPackageVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("falls back to unknown when package metadata has no version", async () => {
    jest.resetModules();
    await jest.unstable_mockModule("node:fs", () => ({
      readFileSync: () => JSON.stringify({ name: "@eliware/agentx" }),
      default: { readFileSync: () => JSON.stringify({ name: "@eliware/agentx" }) },
    }));
    const { getPackageVersion: getMockedVersion } = await import("../src/cli-version.mjs");
    expect(getMockedVersion()).toBe("unknown");
  });
});
