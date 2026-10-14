import { expect, jest, test } from "@jest/globals";
import { createResponseStreamState } from "../../src/agent-turn/response-stream-state.mjs";

test("marks output once and keeps the streamed text", () => {
  const statusController = { beginWriting: jest.fn() };
  const state = createResponseStreamState(statusController);
  state.markOutput();
  state.markOutput();
  state.appendStreamedText("answer");
  state.appendStreamedText(" complete");

  expect(statusController.beginWriting).toHaveBeenCalledTimes(1);
  expect(state.sawOutput()).toBe(true);
  expect(state.streamedText()).toBe("answer complete");
});

test("tracks output when no status controller exists", () => {
  const state = createResponseStreamState();
  state.markOutput();
  expect(state.sawOutput()).toBe(true);
});
