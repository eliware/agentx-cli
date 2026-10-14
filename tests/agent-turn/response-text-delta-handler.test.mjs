import { expect, jest, test } from "@jest/globals";
import { createResponseTextDeltaHandler } from "../../src/agent-turn/response-text-delta-handler.mjs";

test("records and renders normalized text deltas", () => {
  const streamState = {
    markOutput: jest.fn(),
    appendStreamedText: jest.fn(),
  };
  const textRenderer = { writeTextDelta: jest.fn() };
  const onTextDelta = createResponseTextDeltaHandler({ streamState, textRenderer });

  onTextDelta("answer");
  onTextDelta(undefined);

  expect(streamState.markOutput).toHaveBeenCalledTimes(2);
  expect(streamState.appendStreamedText.mock.calls).toEqual([["answer"], [""]]);
  expect(textRenderer.writeTextDelta.mock.calls).toEqual([["answer"], [""]]);
});
