import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

describe("image worker process entrypoint", () => {
  let runImageWorker;
  let stdoutWrite;
  let originalRequest;

  beforeEach(async () => {
    jest.resetModules();
    originalRequest = process.env.AGENTX_IMAGE_REQUEST;
    process.env.AGENTX_IMAGE_REQUEST = JSON.stringify({ args: { prompt: "look" }, cwd: "/work" });
    runImageWorker = jest.fn(async (request) => ({ text: request.args?.prompt }));
    await jest.unstable_mockModule("../src/image-worker-runner.mjs", () => ({ runImageWorker }));
    stdoutWrite = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    if (originalRequest === undefined) delete process.env.AGENTX_IMAGE_REQUEST;
    else process.env.AGENTX_IMAGE_REQUEST = originalRequest;
  });

  test("parses the worker request and writes the runner result", async () => {
    await import("../src/image-worker.mjs");
    expect(runImageWorker).toHaveBeenCalledWith({ args: { prompt: "look" }, cwd: "/work" });
    expect(stdoutWrite).toHaveBeenCalledWith('{"text":"look"}');
  });

  test("uses an empty request when the environment value is absent", async () => {
    delete process.env.AGENTX_IMAGE_REQUEST;
    jest.resetModules();
    await import("../src/image-worker.mjs");
    expect(runImageWorker).toHaveBeenCalledWith({});
    expect(stdoutWrite).toHaveBeenCalledWith("{}");
  });
});
