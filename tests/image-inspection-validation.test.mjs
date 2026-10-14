import { describe, expect, test } from "@jest/globals";
import {
  MAX_IMAGES,
  MAX_PROMPT_LENGTH,
  validateImageInspectionArgs,
} from "../src/image-inspection-validation.mjs";

describe("image inspection validation", () => {
  test("defines request limits", () => {
    expect(MAX_IMAGES).toBe(10);
    expect(MAX_PROMPT_LENGTH).toBe(10000);
  });

  test("rejects missing, blank, and oversized input", () => {
    expect(validateImageInspectionArgs()).toEqual({ error: "ERROR: image prompt is required" });
    expect(validateImageInspectionArgs({ prompt: " " })).toEqual({
      error: "ERROR: image prompt is required",
    });
    expect(validateImageInspectionArgs({ prompt: "x" })).toEqual({
      error: "ERROR: at least one image is required",
    });
    expect(
      validateImageInspectionArgs({ prompt: "x", images: Array.from({ length: 11 }, () => ({})) }),
    ).toEqual({ error: "ERROR: a maximum of 10 images is allowed" });
    expect(validateImageInspectionArgs({ prompt: "x".repeat(10001), images: [{}] })).toEqual({
      error: "ERROR: image prompt exceeds the 10000 character limit",
    });
  });

  test("returns normalized prompt and image list", () => {
    expect(validateImageInspectionArgs({ prompt: " Inspect ", images: [{}] })).toEqual({
      prompt: "Inspect",
      images: [{}],
    });
  });
});
