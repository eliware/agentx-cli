import { describe, expect, jest, test } from "@jest/globals";
import { runImageWorker } from "../src/image-worker-runner.mjs";

const validArgs = { prompt: "inspect", images: [{ path: "image.png" }] };

describe("image worker runner", () => {
  test("avoids client creation for invalid requests and collects inspection usage", async () => {
    const createClient = jest.fn();
    const inspect = jest.fn(async (_client, _args, options) => {
      options.onUsage({ turns: 2, inputTokens: 3, cachedTokens: 1, outputTokens: 4 });
      return "inspected";
    });
    const invalid = [
      { prompt: "", images: [{ path: "image.png" }] },
      { prompt: "inspect", images: "image.png" },
      { prompt: "inspect", images: [] },
      { prompt: "inspect", images: Array(11).fill({ path: "image.png" }) },
      { prompt: "x".repeat(10001), images: [{ path: "image.png" }] },
    ];
    for (const args of invalid) {
      await expect(runImageWorker({ args }, { createClient, inspect })).resolves.toEqual({
        text: "inspected",
        usage: { turns: 2, inputTokens: 3, cachedTokens: 1, outputTokens: 4 },
      });
      expect(inspect).toHaveBeenLastCalledWith(null, args, expect.any(Object));
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  test("creates a client with the lowercase key and closes it after inspection", async () => {
    const client = { responses: { close: jest.fn() } };
    const createClient = jest.fn(() => client);
    const inspect = jest.fn(async (_openai, _args, options) => {
      options.onUsage({ turns: 1, inputTokens: 2, cachedTokens: 1, outputTokens: 3 });
      return "done";
    });
    await expect(
      runImageWorker(
        { args: validArgs, cwd: "/work" },
        { environment: { agentx_api_key: "lower" }, createClient, inspect },
      ),
    ).resolves.toEqual({
      text: "done",
      usage: { turns: 1, inputTokens: 2, cachedTokens: 1, outputTokens: 3 },
    });
    expect(createClient).toHaveBeenCalledWith({ apiKey: "lower", transport: "websocket" });
    expect(inspect).toHaveBeenCalledWith(
      client,
      validArgs,
      expect.objectContaining({ cwd: "/work" }),
    );
    expect(client.responses.close).toHaveBeenCalledTimes(1);
  });

  test("uses the uppercase key and default usage when inspection reports no usage", async () => {
    const client = { responses: { close: jest.fn() } };
    const inspect = jest.fn(async (_openai, _args, options) => {
      options.onUsage(undefined);
      return "done";
    });
    const createClient = jest.fn(() => client);
    const result = await runImageWorker(
      { args: validArgs },
      { environment: { AGENTX_API_KEY: "upper" }, createClient, inspect },
    );
    expect(createClient).toHaveBeenCalledWith({ apiKey: "upper", transport: "websocket" });
    expect(result.usage).toEqual({ turns: 1, inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
  });

  test.each([new Error("inspection failed"), null])(
    "serializes inspection failure %s and closes the client",
    async (error) => {
      const client = { responses: { close: jest.fn() } };
      const result = await runImageWorker(
        { args: validArgs },
        {
          createClient: () => client,
          inspect: jest.fn().mockRejectedValue(error),
        },
      );
      expect(result.error).toBe(`ERROR: ${error?.message || String(error)}`);
      expect(client.responses.close).toHaveBeenCalledTimes(1);
    },
  );

  test("continues when client close fails", async () => {
    const client = { responses: { close: jest.fn().mockRejectedValue(new Error("close failed")) } };
    await expect(
      runImageWorker(
        { args: validArgs },
        { createClient: () => client, inspect: async () => "ok" },
      ),
    ).resolves.toMatchObject({ text: "ok" });
  });

  test("uses the default client, inspector, and process environment", async () => {
    const previousKey = process.env.AGENTX_API_KEY;
    process.env.AGENTX_API_KEY = "test-key";
    const client = { responses: { close: jest.fn() } };
    const createClient = jest.fn(() => client);
    const inspect = jest.fn(async (_openai, _args, options) => {
      options.onUsage({ inputTokens: 1 });
      return "default path";
    });
    try {
      await jest.isolateModulesAsync(async () => {
        await jest.unstable_mockModule("@eliware/openai", () => ({ createOpenAI: createClient }));
        await jest.unstable_mockModule("../src/image-inspector.mjs", () => ({
          runImageInspection: inspect,
        }));
        const { runImageWorker } = await import("../src/image-worker-runner.mjs");
        await expect(runImageWorker({ args: validArgs })).resolves.toMatchObject({
          text: "default path",
          usage: { turns: 1, inputTokens: 1 },
        });
      });
    } finally {
      if (previousKey === undefined) delete process.env.AGENTX_API_KEY;
      else process.env.AGENTX_API_KEY = previousKey;
    }
    expect(createClient).toHaveBeenCalledWith({ apiKey: "test-key", transport: "websocket" });
    expect(inspect).toHaveBeenCalled();
    expect(client.responses.close).toHaveBeenCalled();
  });
});
