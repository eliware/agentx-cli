import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const prepareImageInspectionContent = jest.fn();
await jest.unstable_mockModule("../src/image-inspection-content.mjs", () => ({
  prepareImageInspectionContent,
}));
const { prepareImageInspectionRequest } = await import("../src/image-inspection-request.mjs");

describe("image inspection request", () => {
  beforeEach(() => prepareImageInspectionContent.mockReset());

  test("returns validation errors before building request content", async () => {
    await expect(prepareImageInspectionRequest({ prompt: " " })).resolves.toBe(
      "ERROR: image prompt is required",
    );
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

  test("omits the parent when no response ID exists", async () => {
    prepareImageInspectionContent.mockResolvedValue([
      { type: "input_image", image_url: "data", detail: "low" },
    ]);
    const args = { prompt: "Inspect", images: [{ path: "x" }] };
    await expect(prepareImageInspectionRequest(args)).resolves.not.toHaveProperty(
      "previous_response_id",
    );
  });
});
