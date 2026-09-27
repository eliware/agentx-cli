import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const saveGeneratedImage = jest.fn();
const extractTextFromResponse = jest.fn();
const extractUsage = jest.fn();
const runToolCall = jest.fn();
const toolOutputForCall = jest.fn();
await jest.unstable_mockModule("../src/image-generation.mjs", () => ({ saveGeneratedImage }));
await jest.unstable_mockModule("../src/response.mjs", () => ({
  extractTextFromResponse,
  extractUsage,
}));
await jest.unstable_mockModule("../src/tool-dispatch.mjs", () => ({ runToolCall }));
await jest.unstable_mockModule("../src/tool-output-adapter.mjs", () => ({ toolOutputForCall }));

const { executeImageBranch } = await import("../src/image-branch.mjs");

describe("image branch executor", () => {
  beforeEach(() => {
    saveGeneratedImage.mockReset();
    extractTextFromResponse.mockReset();
    extractUsage.mockReset().mockImplementation((response) => response?.usage || {});
    runToolCall.mockReset();
    toolOutputForCall.mockReset().mockImplementation((call, result) => ({
      type: "shell_call_output",
      call_id: call.call_id,
      output: result,
    }));
  });

  test("submits the isolated branch request and returns its text and usage", async () => {
    const response = { id: "image-response", usage: { input_tokens: 3 }, output: [] };
    const create = jest.fn().mockResolvedValue(response);
    extractTextFromResponse.mockReturnValue("A cat.");
    const onUsage = jest.fn();
    const request = { model: "test-model", input: [{ role: "user", content: [] }], store: true };

    await expect(
      executeImageBranch({ responses: { create } }, request, { cwd: "/work", onUsage }),
    ).resolves.toBe("A cat.");

    expect(create).toHaveBeenCalledWith(request);
    expect(onUsage).toHaveBeenCalledWith({ input_tokens: 3 });
  });

  test("executes shell continuations and reports usage for every response", async () => {
    const call = {
      type: "shell_call",
      call_id: "shell-1",
      action: { commands: ["pwd"] },
    };
    const first = { id: "shell-response", usage: { turn: 1 }, output: [call] };
    const final = { id: "final-response", usage: { turn: 2 }, output: [] };
    const create = jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(final);
    const onUsage = jest.fn();
    runToolCall.mockResolvedValue({ stdout: "workdir", status: "completed" });
    extractTextFromResponse.mockReturnValue("Branch result.");
    const request = {
      model: "test-model",
      input: [{ role: "user", content: [] }],
      store: true,
    };

    await expect(
      executeImageBranch({ responses: { create } }, request, {
        cwd: "/work",
        onUsage,
      }),
    ).resolves.toBe("Branch result.");

    expect(runToolCall).toHaveBeenCalledWith(call, "/work", {
      permission: process.env.AGENTX_PERMISSION || "execute",
    });
    expect(toolOutputForCall).toHaveBeenCalledWith(call, {
      stdout: "workdir",
      status: "completed",
    });
    expect(create.mock.calls[1][0]).toEqual({
      ...request,
      input: [{ type: "shell_call_output", call_id: "shell-1", output: expect.any(Object) }],
      previous_response_id: "shell-response",
      tools: [{ type: "shell", environment: { type: "local" } }, { type: "image_generation" }],
    });
    expect(onUsage.mock.calls).toEqual([[{ turn: 1 }], [{ turn: 2 }]]);
  });

  test("collects generated image paths and includes them with the final text", async () => {
    const generated = { type: "image_generation_call", result: "base64-image" };
    const response = { id: "generated", output: [generated] };
    const create = jest.fn().mockResolvedValue(response);
    saveGeneratedImage.mockResolvedValue("/tmp/generated.png");
    extractTextFromResponse.mockReturnValue("Generated.");

    await expect(executeImageBranch({ responses: { create } }, { model: "model" })).resolves.toBe(
      "Generated.\n\nGenerated image path(s): /tmp/generated.png",
    );
    expect(saveGeneratedImage).toHaveBeenCalledWith(generated);
  });

  test("returns a fallback when the final response has no text or generated image", async () => {
    const create = jest.fn().mockResolvedValue({});
    extractTextFromResponse.mockReturnValue("");
    await expect(executeImageBranch({ responses: { create } }, {})).resolves.toBe(
      "The image inspection returned no text.",
    );
  });
});
