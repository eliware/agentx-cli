import { describe, expect, jest, test } from "@jest/globals";
import { prepareAgentStartup } from "../src/agent-entrypoint-config.mjs";

describe("agent entrypoint configuration", () => {
  test("loads environment state and resolves the working directory", async () => {
    const readEnvState = jest.fn();
    const env = { AGENTX_MODEL: "gpt-5.6-luna" };
    await expect(
      prepareAgentStartup(
        { flags: { cwd: "child" }, messageArgs: ["hello"] },
        { readEnvState, env, cwd: "/work" },
      ),
    ).resolves.toEqual({ cwd: expect.stringMatching(/work[\\/]child$/), messageArgs: ["hello"] });
    expect(readEnvState).toHaveBeenCalled();
    expect(env.AGENTX_MODEL).toBe("gpt-6-luna");
  });

  test("rejects an empty cwd option", async () => {
    await expect(
      prepareAgentStartup(
        { flags: { cwd: "" }, messageArgs: [] },
        { readEnvState: jest.fn(), env: {}, cwd: "/work" },
      ),
    ).rejects.toThrow("--cwd requires a path");
  });
});
