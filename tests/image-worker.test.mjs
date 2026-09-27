import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

describe("image worker entrypoint", () => {
  let createOpenAI;
  let client;
  let stdoutWrite;
  let originalRequest;
  let originalLowerKey;
  let originalUpperKey;
  let inspection;

  beforeEach(async () => {
    jest.resetModules();
    originalRequest = process.env.AGENTX_IMAGE_REQUEST;
    originalLowerKey = process.env.agentx_api_key;
    originalUpperKey = process.env.AGENTX_API_KEY;
    process.env.AGENTX_IMAGE_REQUEST = JSON.stringify({
      args: { prompt: "describe", images: [{ path: "image.png" }] },
      cwd: "/work",
    });
    delete process.env.agentx_api_key;
    delete process.env.AGENTX_API_KEY;

    client = { responses: { close: jest.fn(async () => {}) } };
    createOpenAI = jest.fn(() => client);
    inspection = jest.fn(async (_openai, _args, options) => {
      options.onUsage({ turns: 2, inputTokens: 3, cachedTokens: 1, outputTokens: 4 });
      return "inspected image";
    });
    await jest.unstable_mockModule("@eliware/openai", () => ({ createOpenAI }));
    await jest.unstable_mockModule("../src/image-inspector.mjs", () => ({
      runImageInspection: inspection,
    }));
    stdoutWrite = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    if (originalRequest === undefined) delete process.env.AGENTX_IMAGE_REQUEST;
    else process.env.AGENTX_IMAGE_REQUEST = originalRequest;
    if (originalLowerKey === undefined) delete process.env.agentx_api_key;
    else process.env.agentx_api_key = originalLowerKey;
    if (originalUpperKey === undefined) delete process.env.AGENTX_API_KEY;
    else process.env.AGENTX_API_KEY = originalUpperKey;
  });

  async function execute(request) {
    jest.resetModules();
    process.env.AGENTX_IMAGE_REQUEST = JSON.stringify(request);
    await import("../src/image-worker.mjs");
    return JSON.parse(stdoutWrite.mock.calls.at(-1)[0]);
  }

  test("validates prompt and image arguments without creating a client", async () => {
    const invalidRequests = [
      { args: { prompt: "", images: [{ path: "image.png" }] } },
      { args: { prompt: "look", images: "image.png" } },
      { args: { prompt: "look", images: [] } },
      { args: { prompt: "look", images: Array(11).fill({ path: "image.png" }) } },
      { args: { prompt: "x".repeat(10001), images: [{ path: "image.png" }] } },
    ];
    for (const request of invalidRequests) {
      const result = await execute(request);
      expect(result).toEqual({
        text: "inspected image",
        usage: { turns: 2, inputTokens: 3, cachedTokens: 1, outputTokens: 4 },
      });
      expect(inspection).toHaveBeenLastCalledWith(null, request.args, expect.any(Object));
    }
    expect(createOpenAI).not.toHaveBeenCalled();
  });

  test("uses an empty request when the worker request environment variable is absent", async () => {
    delete process.env.AGENTX_IMAGE_REQUEST;
    jest.resetModules();
    await import("../src/image-worker.mjs");
    expect(inspection).toHaveBeenCalledWith(null, undefined, expect.any(Object));
    expect(JSON.parse(stdoutWrite.mock.calls.at(-1)[0])).toMatchObject({ text: "inspected image" });
    expect(createOpenAI).not.toHaveBeenCalled();
  });

  test("creates a client with the configured key and forwards worker usage", async () => {
    process.env.agentx_api_key = "lower-key";
    const result = await execute({ args: { prompt: "look", images: [{ path: "image.png" }] } });

    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "lower-key", transport: "websocket" });
    expect(inspection).toHaveBeenCalledWith(
      client,
      { prompt: "look", images: [{ path: "image.png" }] },
      expect.objectContaining({
        onUsage: expect.any(Function),
      }),
    );
    expect(result).toEqual({
      text: "inspected image",
      usage: { turns: 2, inputTokens: 3, cachedTokens: 1, outputTokens: 4 },
    });
    expect(client.responses.close).toHaveBeenCalledTimes(1);
  });

  test("falls back to the uppercase key and usage defaults when optional usage is absent", async () => {
    process.env.AGENTX_API_KEY = "upper-key";
    inspection.mockImplementationOnce(async (_openai, _args, options) => {
      options.onUsage(undefined);
      return "done";
    });
    const result = await execute({ args: { prompt: "look", images: [{ path: "image.png" }] } });
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "upper-key", transport: "websocket" });
    expect(result.usage).toEqual({ turns: 1, inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
  });

  test("serializes inspection errors and always attempts client cleanup", async () => {
    inspection.mockRejectedValueOnce(new Error("inspection failed"));
    await expect(
      execute({ args: { prompt: "look", images: [{ path: "image.png" }] } }),
    ).resolves.toEqual({
      error: "ERROR: inspection failed",
      usage: { turns: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
    });
    expect(client.responses.close).toHaveBeenCalledTimes(1);

    jest.resetModules();
    inspection.mockRejectedValueOnce(null);
    await expect(
      execute({ args: { prompt: "look", images: [{ path: "image.png" }] } }),
    ).resolves.toMatchObject({ error: "ERROR: null" });
  });

  test("tolerates a failing close during finalization", async () => {
    client.responses.close.mockRejectedValueOnce(new Error("close failed"));
    await expect(
      execute({ args: { prompt: "look", images: [{ path: "image.png" }] } }),
    ).resolves.toMatchObject({ text: "inspected image" });
    expect(client.responses.close).toHaveBeenCalledTimes(1);
  });
});
