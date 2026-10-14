import { expect, jest, test } from "@jest/globals";

const encodeImageInput = jest.fn();
await jest.unstable_mockModule("../src/image-input.mjs", () => ({ encodeImageInput }));
const { prepareImageInspectionContent } = await import("../src/image-inspection-content.mjs");

test("encodes images in order and places each caption before its image", async () => {
  encodeImageInput
    .mockResolvedValueOnce({ dataUrl: "data:first", detail: "high" })
    .mockResolvedValueOnce({ dataUrl: "data:second", detail: "low" });
  await expect(
    prepareImageInspectionContent(
      [{ path: "first.png", caption: "First" }, { path: "second.png" }],
      { cwd: "/work", detail: "high" },
    ),
  ).resolves.toEqual([
    { type: "input_text", text: "First" },
    { type: "input_image", image_url: "data:first", detail: "high" },
    { type: "input_image", image_url: "data:second", detail: "low" },
  ]);
  expect(encodeImageInput.mock.calls).toEqual([
    ["first.png", { cwd: "/work", detail: "high" }],
    ["second.png", { cwd: "/work", detail: "high" }],
  ]);
});

test("stringifies captions and accepts an empty image list", async () => {
  encodeImageInput.mockResolvedValue({ dataUrl: "data", detail: "low" });
  await expect(
    prepareImageInspectionContent([{ path: "image.png", caption: 42 }], {
      cwd: "/work",
      detail: "low",
    }),
  ).resolves.toEqual([
    { type: "input_text", text: "42" },
    { type: "input_image", image_url: "data", detail: "low" },
  ]);
  await expect(prepareImageInspectionContent([], { cwd: "/work", detail: "low" })).resolves.toEqual(
    [],
  );
});
