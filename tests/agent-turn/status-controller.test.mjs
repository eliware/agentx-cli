import { expect, test } from "@jest/globals";
import {
  createStatusLineController,
  formatSpinnerFrame,
} from "../../src/agent-turn/status-controller.mjs";

test("composes phase state, display, and lifecycle behavior", () => {
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
});

test("returns no spinner animation", () => {
  expect(formatSpinnerFrame()).toBe("");
});
