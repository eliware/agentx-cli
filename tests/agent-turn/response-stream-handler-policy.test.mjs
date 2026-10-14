import { expect, jest, test } from "@jest/globals";
import { createResponseStreamHandlers } from "../../src/agent-turn/response-stream-handler-policy.mjs";

test("copies live handlers without changing the source object", () => {
  const onEvent = jest.fn();
  const live = { handlers: { onEvent } };
  const handlers = createResponseStreamHandlers(live, false);
  expect(handlers).not.toBe(live.handlers);
  expect(handlers.onEvent).toBe(onEvent);
});

test("selects a debug event handler when no live handlers exist", () => {
  const write = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    const handlers = createResponseStreamHandlers({ handlers: null }, true);
    expect(handlers.onEvent).toEqual(expect.any(Function));
    handlers.onEvent({ type: "response.completed" }, { raw: "event" });
    expect(write).toHaveBeenCalledWith('[openai:event] {"raw":"event"}\n');
  } finally {
    write.mockRestore();
  }
});

test("keeps live callbacks while replacing the event callback in debug mode", () => {
  const onTextDelta = jest.fn();
  const handlers = createResponseStreamHandlers({ handlers: { onTextDelta } }, true);
  expect(handlers.onTextDelta).toBe(onTextDelta);
  expect(handlers.onEvent).not.toBeUndefined();
});

test("returns no handlers when live and debug modes are disabled", () => {
  expect(createResponseStreamHandlers({ handlers: null }, false)).toBeUndefined();
});
