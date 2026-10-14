import { afterEach, expect, jest, test } from "@jest/globals";
import {
  createStatusLineController,
  formatSpinnerFrame,
} from "../../src/agent-turn/status-controller.mjs";

let stdoutWrite;
afterEach(() => stdoutWrite?.mockRestore());

test("composes phase state, display, and lifecycle behavior", () => {
  stdoutWrite = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  const controller = createStatusLineController();
  try {
    expect(controller.snapshot()).toEqual(
      expect.objectContaining({ time: expect.any(String), reasoning: expect.any(Object) }),
    );
    controller.showReasoning();
    expect(controller.snapshot().reasoning.active).toBe(true);
    controller.clear();
    expect(controller.snapshot().reasoning.active).toBe(false);
  } finally {
    controller.stop();
  }
  expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('{"time":"'));
});

test("returns no spinner animation", () => {
  expect(formatSpinnerFrame()).toBe("");
});
