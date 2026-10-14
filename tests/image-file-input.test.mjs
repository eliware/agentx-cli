import { describe, expect, test } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { assertReadableImage, resolveImagePath } from "../src/image-file-input.mjs";

describe("image file input", () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agentx-image-file-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("resolves paths and rejects an empty path", () => {
    expect(resolveImagePath("images/picture.png", "/work")).toBe(
      resolve("/work", "images", "picture.png"),
    );
    expect(() => resolveImagePath(undefined)).toThrow("Image path is required");
  });

  test("reads readable files and rejects missing, non-file, and oversized paths", async () => {
    const file = join(dir, "picture.png");
    await writeFile(file, "image");
    await expect(assertReadableImage(file)).resolves.toEqual(Buffer.from("image"));
    await expect(assertReadableImage(join(dir, "missing"))).rejects.toThrow(
      "Unable to read image file",
    );
    await expect(assertReadableImage(dir)).rejects.toThrow("not a regular file");
    await expect(assertReadableImage(file, 4)).rejects.toThrow("exceeds");
  });
});
