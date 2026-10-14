import { beforeEach, expect, jest, test } from "@jest/globals";

const saveGeneratedImage = jest.fn();
await jest.unstable_mockModule("../src/image-generation.mjs", () => ({ saveGeneratedImage }));
const { collectGeneratedImagePaths, formatImageBranchResult } =
  await import("../src/image-branch-results.mjs");

beforeEach(() => saveGeneratedImage.mockReset());

test("collects paths from image results and skips incomplete items", async () => {
  const image = { type: "image_generation_call", result: "image-data" };
  saveGeneratedImage.mockResolvedValue("/tmp/image.png");
  await expect(
    collectGeneratedImagePaths({
      output: [{ type: "image_generation_call" }, { type: "text" }, image],
    }),
  ).resolves.toEqual(["/tmp/image.png"]);
  expect(saveGeneratedImage).toHaveBeenCalledTimes(1);
  expect(saveGeneratedImage).toHaveBeenCalledWith(image);
});

test("returns no paths when output is absent", async () => {
  await expect(collectGeneratedImagePaths(null)).resolves.toEqual([]);
});

test("formats text with generated paths", () => {
  expect(formatImageBranchResult("Result.", ["one.png", "two.png"])).toBe(
    "Result.\n\nGenerated image path(s): one.png, two.png",
  );
});

test("formats text without generated paths", () => {
  expect(formatImageBranchResult("Result.", [])).toBe("Result.");
});

test("returns a fallback when the branch has no text or images", () => {
  expect(formatImageBranchResult("", [])).toBe("The image inspection returned no text.");
});
