import { describe, expect, test } from "@jest/globals";
import { prepareAgentStartup } from "../src/agent-entrypoint-config.mjs";

describe("agent entrypoint configuration", () => {
  test("resolves the working directory and keeps message arguments", async () => {
    await expect(
      prepareAgentStartup({ flags: { cwd: "child" }, messageArgs: ["hello"] }, { cwd: "/work" }),
    ).resolves.toEqual({ cwd: expect.stringMatching(/work[\\/]child$/), messageArgs: ["hello"] });
  });

  test("rejects an empty cwd option", async () => {
    await expect(
      prepareAgentStartup({ flags: { cwd: "" }, messageArgs: [] }, { cwd: "/work" }),
    ).rejects.toThrow("--cwd requires a path");
  });

  test("keeps the current directory when no cwd option exists", async () => {
    await expect(
      prepareAgentStartup({ flags: {}, messageArgs: [] }, { cwd: "/work" }),
    ).resolves.toEqual({ cwd: "/work", messageArgs: [] });
  });
});
