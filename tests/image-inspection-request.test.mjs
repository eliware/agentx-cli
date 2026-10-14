import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const prepareImageInspectionContent = jest.fn();
await jest.unstable_mockModule("../src/image-inspection-content.mjs", () => ({
  prepareImageInspectionContent,
}));
const { MAX_IMAGES, MAX_PROMPT_LENGTH, prepareImageInspectionRequest } =
  await import("../src/image-inspection-request.mjs");

describe("image inspection request", () => {
  beforeEach(() => prepareImageInspectionContent.mockReset());

  test("defines request input limits", () => {
    expect(MAX_IMAGES).toBe(10);
    expect(MAX_PROMPT_LENGTH).toBe(10000);
  });

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
    expect(prepareImageInspectionContent).not.toHaveBeenCalled();
  });

  test("builds ordered image content and selects the caller predecessor", async () => {
    prepareImageInspectionContent.mockResolvedValue([
      { type: "input_text", text: "Pet" },
      { type: "input_image", image_url: "data:image/jpeg;base64,x", detail: "high" },
    ]);
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
    expect(prepareImageInspectionContent).toHaveBeenCalledWith([{ path: "cat", caption: "Pet" }], {
      cwd: "/work",
      detail: "high",
    });
  });

  test("uses the response fallback and omits a missing parent", async () => {
    prepareImageInspectionContent.mockResolvedValue([
      { type: "input_image", image_url: "data", detail: "low" },
    ]);
    const args = { prompt: "Inspect", images: [{ path: "x" }] };
    await expect(
      prepareImageInspectionRequest(args, { responseId: "fallback" }),
    ).resolves.toHaveProperty("previous_response_id", "fallback");
    await expect(prepareImageInspectionRequest(args)).resolves.not.toHaveProperty(
      "previous_response_id",
    );
  });
});
