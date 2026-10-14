import { expect, jest, test } from "@jest/globals";
import { formatImageWorkerResult } from "../src/image-worker-result.mjs";

test("decodes text and forwards usage", () => {
  const onUsage = jest.fn();
  expect(
    formatImageWorkerResult({
      stdout: JSON.stringify({ text: "inspected", usage: { inputTokens: 3 } }),
      stderr: "",
      code: 0,
      onUsage,
    }),
  ).toBe("inspected");
  expect(onUsage).toHaveBeenCalledWith({ inputTokens: 3 });
});

test("formats worker errors and nonzero exit results", () => {
  expect(formatImageWorkerResult({ stdout: "{}", stderr: "failed", code: 2 })).toBe(
    "ERROR: failed",
  );
  expect(
    formatImageWorkerResult({
      stdout: JSON.stringify({ error: "partial failure" }),
      stderr: "",
      code: 7,
    }),
  ).toBe("ERROR: partial failure");
  expect(formatImageWorkerResult({ stdout: "{}", stderr: "", code: 7 })).toBe(
    "ERROR: image worker exited with code 7",
  );
});

test("formats malformed output and missing response text", () => {
  expect(formatImageWorkerResult({ stdout: "{bad", stderr: "invalid json", code: 0 })).toBe(
    "ERROR: invalid image worker response: invalid json",
  );
  expect(formatImageWorkerResult({ stdout: "{bad", stderr: "", code: 0 })).toBe(
    "ERROR: invalid image worker response",
  );
  expect(formatImageWorkerResult({ stdout: "{bad", stderr: "", code: 2 })).toBe(
    "ERROR: image worker exited with code 2",
  );
  expect(formatImageWorkerResult({ stdout: "{}", stderr: "", code: 0 })).toBe(
    "The image inspection returned no text.",
  );
});

test("formats a process launch error", () => {
  expect(formatImageWorkerResult({ error: new Error("spawn failed") })).toBe("ERROR: spawn failed");
  expect(formatImageWorkerResult({ error: {} })).toBe("ERROR: [object Object]");
});
