import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const encodeImageInput = jest.fn();
const executeImageBranch = jest.fn();
const runImageInspectionProcess = jest.fn();
await jest.unstable_mockModule("../src/image-input.mjs", () => ({ encodeImageInput }));
await jest.unstable_mockModule("../src/image-branch.mjs", () => ({ executeImageBranch }));
await jest.unstable_mockModule("../src/image-worker-bridge.mjs", () => ({
  runImageInspectionProcess,
}));

const { inspectImage, runImageInspection } = await import("../src/image-inspector.mjs");

describe("image inspection request preparation", () => {
  beforeEach(() => {
    encodeImageInput.mockReset();
    executeImageBranch.mockReset();
    runImageInspectionProcess.mockReset();
  });

  test("delegates isolated process execution to the worker bridge", async () => {
    runImageInspectionProcess.mockResolvedValue("validated");
    const args = { prompt: "Inspect", images: [{ path: "x" }] };
    const options = { cwd: process.cwd(), processWorker: true };
    await expect(inspectImage({}, args, options)).resolves.toBe("validated");
    expect(runImageInspectionProcess).toHaveBeenCalledWith(args, options);
  });

  test("defaults to direct branch execution when options are omitted", async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,x", detail: "low" });
    executeImageBranch.mockResolvedValue("inspected");
    await expect(inspectImage({}, { prompt: "Inspect", images: [{ path: "x" }] })).resolves.toBe(
      "inspected",
    );
    expect(executeImageBranch).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ model: undefined, store: true }),
      { cwd: undefined, onUsage: undefined },
    );
  });

  test("validates prompt and image limits before encoding or branch execution", async () => {
    const openai = {};
    await expect(runImageInspection(openai, undefined)).resolves.toBe(
      "ERROR: image prompt is required",
    );
    await expect(runImageInspection(openai, { prompt: " ", images: [{}] })).resolves.toBe(
      "ERROR: image prompt is required",
    );
    await expect(runImageInspection(openai, { prompt: "x" })).resolves.toBe(
      "ERROR: at least one image is required",
    );
    await expect(runImageInspection(openai, { prompt: "x", images: [] })).resolves.toBe(
      "ERROR: at least one image is required",
    );
    await expect(
      runImageInspection(openai, { prompt: "x", images: Array.from({ length: 11 }, () => ({})) }),
    ).resolves.toBe("ERROR: a maximum of 10 images is allowed");
    await expect(
      runImageInspection(openai, { prompt: "x".repeat(10001), images: [{}] }),
    ).resolves.toBe("ERROR: image prompt exceeds the 10000 character limit");
    expect(encodeImageInput).not.toHaveBeenCalled();
    expect(executeImageBranch).not.toHaveBeenCalled();
  });

  test("builds the isolated image request and delegates branch execution", async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,abc", detail: "high" });
    executeImageBranch.mockResolvedValue("A cat.");
    const openai = {};
    const onUsage = jest.fn();
    const options = {
      cwd: "/work",
      responseId: "tool-call",
      previousResponseId: "parent",
      callerResponse: { id: "tool-call" },
      model: "gpt-test",
      onUsage,
    };

    await expect(
      inspectImage(
        openai,
        { images: [{ path: "cat.png", caption: "A pet" }], prompt: "Describe it", detail: "high" },
        options,
      ),
    ).resolves.toBe("A cat.");

    expect(encodeImageInput).toHaveBeenCalledWith("cat.png", { cwd: "/work", detail: "high" });
    expect(executeImageBranch).toHaveBeenCalledWith(
      openai,
      {
        model: "gpt-test",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Describe it" },
              { type: "input_text", text: "A pet" },
              { type: "input_image", image_url: "data:image/jpeg;base64,abc", detail: "high" },
            ],
          },
        ],
        previous_response_id: "parent",
        store: true,
        tools: [{ type: "shell", environment: { type: "local" } }, { type: "image_generation" }],
      },
      { cwd: "/work", onUsage },
    );
  });

  test("selects caller predecessor then response fallback for branch parent", async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,x", detail: "low" });
    executeImageBranch.mockResolvedValue("ok");
    const openai = {};
    const args = { prompt: "Inspect", images: [{ path: "x" }] };

    await runImageInspection(openai, args, {
      responseId: "fallback",
      callerResponse: { previous_response_id: "caller-parent" },
    });
    expect(executeImageBranch.mock.calls[0][1].previous_response_id).toBe("caller-parent");

    await runImageInspection(openai, args, {
      responseId: "fallback",
      callerResponse: { id: "tool" },
    });
    expect(executeImageBranch.mock.calls[1][1].previous_response_id).toBe("fallback");

    await runImageInspection(openai, args, { callerResponse: { id: "tool" } });
    expect(executeImageBranch.mock.calls[2][1]).not.toHaveProperty("previous_response_id");
  });

  test("defaults to low image detail and converts encoding failures to tool output", async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,x", detail: "low" });
    executeImageBranch.mockResolvedValue("The image inspection returned no text.");
    const openai = {};
    const args = { prompt: "Inspect", images: [{ path: "x" }] };
    await expect(runImageInspection(openai, args)).resolves.toBe(
      "The image inspection returned no text.",
    );
    expect(encodeImageInput).toHaveBeenCalledWith("x", { cwd: undefined, detail: "low" });

    encodeImageInput.mockRejectedValueOnce(new Error("cannot read"));
    await expect(runImageInspection(openai, args)).resolves.toBe("ERROR: cannot read");
    encodeImageInput.mockRejectedValueOnce("bad");
    await expect(runImageInspection(openai, args)).resolves.toBe("ERROR: bad");
  });
});
