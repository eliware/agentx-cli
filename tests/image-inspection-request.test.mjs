import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const encodeImageInput = jest.fn();
await jest.unstable_mockModule("../src/image-input.mjs", () => ({ encodeImageInput }));
const { prepareImageInspectionRequest } = await import("../src/image-inspection-request.mjs");

describe("image inspection request", () => {
  beforeEach(() => encodeImageInput.mockReset());

  test("validates prompt and image limits before encoding", async () => {
    const invalid = [
      [undefined, "ERROR: image prompt is required"],
      [{ prompt: " " }, "ERROR: image prompt is required"],
      [{ prompt: "x" }, "ERROR: at least one image is required"],
      [
        { prompt: "x", images: Array.from({ length: 11 }, () => ({})) },
        "ERROR: a maximum of 10 images is allowed",
      ],
      [
        { prompt: "x".repeat(10001), images: [{}] },
        "ERROR: image prompt exceeds the 10000 character limit",
      ],
    ];
    for (const [args, result] of invalid)
      await expect(prepareImageInspectionRequest(args)).resolves.toBe(result);
    expect(encodeImageInput).not.toHaveBeenCalled();
  });

  test("builds ordered image content and selects the caller predecessor", async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: "data:image/jpeg;base64,x", detail: "high" });
    await expect(
      prepareImageInspectionRequest(
        { prompt: " Inspect ", detail: "high", images: [{ path: "cat", caption: "Pet" }] },
        { cwd: "/work", model: "gpt-test", callerResponse: { previous_response_id: "parent" } },
      ),
    ).resolves.toEqual({
      model: "gpt-test",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Inspect" },
            { type: "input_text", text: "Pet" },
            { type: "input_image", image_url: "data:image/jpeg;base64,x", detail: "high" },
          ],
        },
      ],
      previous_response_id: "parent",
      store: true,
      tools: [{ type: "shell", environment: { type: "local" } }, { type: "image_generation" }],
    });
    expect(encodeImageInput).toHaveBeenCalledWith("cat", { cwd: "/work", detail: "high" });
  });

  test("uses the response fallback and omits a missing parent", async () => {
    encodeImageInput.mockResolvedValue({ dataUrl: "data", detail: "low" });
    const args = { prompt: "Inspect", images: [{ path: "x" }] };
    await expect(
      prepareImageInspectionRequest(args, { responseId: "fallback" }),
    ).resolves.toHaveProperty("previous_response_id", "fallback");
    await expect(prepareImageInspectionRequest(args)).resolves.not.toHaveProperty(
      "previous_response_id",
    );
  });
});
