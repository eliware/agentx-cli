import { describe, expect, test } from "@jest/globals";
import {
  isValidImageWorkerRequest,
  resolveImageWorkerApiKey,
} from "../src/image-worker-config.mjs";

describe("image worker configuration", () => {
  test("prefers the lowercase key and falls back to uppercase or undefined", () => {
    expect(resolveImageWorkerApiKey({ agentx_api_key: "lower", AGENTX_API_KEY: "upper" })).toBe(
      "lower",
    );
    expect(resolveImageWorkerApiKey({ AGENTX_API_KEY: "upper" })).toBe("upper");
    expect(resolveImageWorkerApiKey({})).toBeUndefined();
  });

  test("validates required prompt and image fields", () => {
    expect(isValidImageWorkerRequest(undefined)).toBe(false);
    expect(isValidImageWorkerRequest({ prompt: "  ", images: [{ path: "image.png" }] })).toBe(
      false,
    );
    expect(isValidImageWorkerRequest({ prompt: "look", images: "image.png" })).toBe(false);
    expect(isValidImageWorkerRequest({ prompt: "look", images: [] })).toBe(false);
    expect(
      isValidImageWorkerRequest({ prompt: "look", images: Array(11).fill({ path: "image.png" }) }),
    ).toBe(false);
    expect(
      isValidImageWorkerRequest({ prompt: "x".repeat(10_001), images: [{ path: "image.png" }] }),
    ).toBe(false);
  });

  test("accepts inclusive prompt and image count limits", () => {
    expect(
      isValidImageWorkerRequest({
        prompt: "x".repeat(10_000),
        images: Array(10).fill({ path: "x" }),
      }),
    ).toBe(true);
  });
});
