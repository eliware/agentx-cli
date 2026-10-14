import { describe, expect, jest, test } from "@jest/globals";

const appendCliTranscript = jest.fn((current, label, path) => `${current}:${label}:${path}`);
const saveGeneratedImage = jest.fn(async () => "default.png");
const writeTerminal = jest.fn();
const formatSystemMessage = jest.fn((message) => `system:${message}`);
await jest.unstable_mockModule("../../src/request-context.mjs", () => ({ appendCliTranscript }));
await jest.unstable_mockModule("../../src/image-generation.mjs", () => ({ saveGeneratedImage }));
await jest.unstable_mockModule("../../src/terminal-output.mjs", () => ({ writeTerminal }));
await jest.unstable_mockModule("../../src/shell-display.mjs", () => ({ formatSystemMessage }));

const { handleSessionImageGeneration } =
  await import("../../src/agent/session-image-generation.mjs");

function createHandler(saveGeneratedImage) {
  const state = { transcript: "existing transcript" };
  const appendTranscript = jest.fn((current, label, path) => `${current}; ${label}: ${path}`);
  const write = jest.fn();
  const saveState = jest.fn();
  const handle = handleSessionImageGeneration({
    saveGeneratedImage,
    getTranscript: () => state.transcript,
    setTranscript: (value) => {
      state.transcript = value;
    },
    appendTranscript,
    write,
    formatSystemMessage: (message) => `[${message}]`,
    saveState,
  });
  return { handle, state, appendTranscript, write, saveState };
}

describe("session image generation", () => {
  test("uses default image, transcript, and output services", async () => {
    const getTranscript = jest.fn(() => "prior");
    const setTranscript = jest.fn();
    const saveState = jest.fn();
    const handle = handleSessionImageGeneration({ getTranscript, setTranscript, saveState });

    await expect(handle({ item: "image" })).resolves.toBe("Generated image saved to default.png");
    expect(saveGeneratedImage).toHaveBeenCalledWith("image");
    expect(appendCliTranscript).toHaveBeenCalledWith("prior", "generated image", "default.png");
    expect(setTranscript).toHaveBeenCalledWith("prior:generated image:default.png");
    expect(writeTerminal).toHaveBeenCalledWith("system:Generated image saved: default.png\n");
    expect(saveState).toHaveBeenCalledTimes(1);
  });

  test("saves the image, records its path, reports success, and persists the session", async () => {
    const image = { type: "image_generation_call", result: "encoded" };
    const saveGeneratedImage = jest.fn().mockResolvedValue("C:/temp/generated.png");
    const handler = createHandler(saveGeneratedImage);

    await expect(handler.handle({ item: image })).resolves.toBe(
      "Generated image saved to C:/temp/generated.png",
    );
    expect(saveGeneratedImage).toHaveBeenCalledWith(image);
    expect(handler.appendTranscript).toHaveBeenCalledWith(
      "existing transcript",
      "generated image",
      "C:/temp/generated.png",
    );
    expect(handler.state.transcript).toBe(
      "existing transcript; generated image: C:/temp/generated.png",
    );
    expect(handler.write).toHaveBeenCalledWith("[Generated image saved: C:/temp/generated.png]\n");
    expect(handler.saveState).toHaveBeenCalledTimes(1);
  });

  test("reports save errors without changing the transcript or persisting", async () => {
    const handler = createHandler(jest.fn().mockRejectedValue(new Error("disk full")));

    await expect(handler.handle({ item: {} })).resolves.toBe(
      "Unable to save generated image: disk full",
    );
    expect(handler.appendTranscript).not.toHaveBeenCalled();
    expect(handler.state.transcript).toBe("existing transcript");
    expect(handler.write).toHaveBeenCalledWith("[Unable to save generated image: disk full]\n");
    expect(handler.saveState).not.toHaveBeenCalled();
  });

  test("formats non-Error failures", async () => {
    const handler = createHandler(jest.fn().mockRejectedValue("write failed"));

    await expect(handler.handle({ item: {} })).resolves.toBe(
      "Unable to save generated image: write failed",
    );
  });
});
