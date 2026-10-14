import { describe, expect, test } from "@jest/globals";
import { createImageWorkerLaunch } from "../src/image-worker-request.mjs";

describe("image worker request", () => {
  test("keeps runtime variables and AgentX keys only", () => {
    const launch = createImageWorkerLaunch(
      { prompt: "look" },
      { cwd: "/work", responseId: "response", model: "test-model" },
      {
        PATH: "runtime",
        TEMP: "temp",
        agentx_api_key: "lower-key",
        AGENTX_API_KEY: "agentx-key",
        PRIVATE_TOKEN: "secret",
      },
    );
    expect(launch.command).toBe(process.execPath);
    expect(launch.args[0]).toContain("image-worker.mjs");
    expect(launch.options).toMatchObject({ cwd: "/work", stdio: ["ignore", "pipe", "pipe"] });
    expect(launch.options.env).toMatchObject({
      PATH: "runtime",
      TEMP: "temp",
      agentx_api_key: "lower-key",
      AGENTX_API_KEY: "agentx-key",
    });
    expect(launch.options.env).not.toHaveProperty("PRIVATE_TOKEN");
    expect(JSON.parse(launch.options.env.AGENTX_IMAGE_REQUEST)).toMatchObject({
      args: { prompt: "look" },
      cwd: "/work",
      responseId: "response",
      model: "test-model",
    });
  });

  test("uses process environment and default launch options", () => {
    const launch = createImageWorkerLaunch({ prompt: "look" });
    expect(launch.command).toBe(process.execPath);
    expect(launch.options.cwd).toBeUndefined();
    expect(JSON.parse(launch.options.env.AGENTX_IMAGE_REQUEST)).toEqual({
      args: { prompt: "look" },
    });
  });
});
