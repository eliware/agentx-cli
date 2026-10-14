import { expect, jest, test } from "@jest/globals";
import { defaultConvertToJpeg } from "../src/image-jpeg-conversion.mjs";

test("uses Sharp rotation, resize, and JPEG settings", async () => {
  const result = Buffer.from("jpeg");
  const toBuffer = jest.fn(async () => result);
  const jpeg = jest.fn(() => ({ toBuffer }));
  const resize = jest.fn(() => ({ jpeg }));
  const rotate = jest.fn(() => ({ resize }));
  const sharp = jest.fn(() => ({ rotate }));
  await expect(
    defaultConvertToJpeg(Buffer.from("source"), { maxDimension: 2048, quality: 72 }, async () => ({
      default: sharp,
    })),
  ).resolves.toBe(result);
  expect(sharp).toHaveBeenCalledWith(Buffer.from("source"));
  expect(rotate).toHaveBeenCalledTimes(1);
  expect(resize).toHaveBeenCalledWith({
    width: 2048,
    height: 2048,
    fit: "inside",
    withoutEnlargement: true,
  });
  expect(jpeg).toHaveBeenCalledWith({ quality: 72 });
  expect(toBuffer).toHaveBeenCalledTimes(1);
});

test("reports when the optional Sharp package is unavailable", async () => {
  await expect(
    defaultConvertToJpeg(Buffer.from("source"), {}, async () => {
      throw new Error("missing");
    }),
  ).rejects.toThrow("optional sharp package");
});
