import { expect, jest, test } from "@jest/globals";
import { executeImageToolCall, isImageToolCall } from "../../src/agent-turn/tool-image-call.mjs";

test("identifies only image function calls", () => {
  expect(isImageToolCall({ type: "function_call", name: "view_image" })).toBe(true);
  expect(isImageToolCall({ type: "function_call", name: "other" })).toBe(false);
  expect(isImageToolCall(null)).toBe(false);
});

test("parses image arguments and forwards response context", async () => {
  const onViewImage = jest.fn(async () => "image result");
  await expect(
    executeImageToolCall(
      { type: "function_call", name: "view_image", arguments: '{"path":"image.png"}' },
      {
        onViewImage,
        response: "response",
        previousResponseId: "previous",
        baseRequest: {},
        cwd: "/repo",
      },
    ),
  ).resolves.toBe("image result");
  expect(onViewImage).toHaveBeenCalledWith({
    args: { path: "image.png" },
    response: "response",
    previousResponseId: "previous",
    baseRequest: {},
    cwd: "/repo",
  });
});

test("uses input when arguments are absent and handles invalid or missing adapters", async () => {
  const onViewImage = jest.fn(async () => "input result");
  await executeImageToolCall({ input: '{"detail":"high"}' }, { onViewImage });
  expect(onViewImage).toHaveBeenCalledWith(expect.objectContaining({ args: { detail: "high" } }));
  await executeImageToolCall({ arguments: "invalid" }, { onViewImage });
  expect(onViewImage).toHaveBeenLastCalledWith(expect.objectContaining({ args: {} }));
  await expect(executeImageToolCall({}, {})).resolves.toBe(
    "ERROR: image inspection is unavailable",
  );
});
