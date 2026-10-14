import { expect, test, jest } from "@jest/globals";
import { createStatusLifecycle } from "../../src/agent-turn/status-lifecycle.mjs";

test("coordinates phase changes and pause state", () => {
  const phase = {
    state: null,
    setState(next) {
      this.state = next;
    },
    snapshot: jest.fn(() => ({})),
    finalize: jest.fn(),
    reset() {
      this.state = null;
    },
  };
  const display = { clear: jest.fn(), render: jest.fn(), prepareOutput: jest.fn() };
  const controller = createStatusLifecycle({
    phase,
    display,
    quiet: true,
    transitionOnly: false,
    state: { paused: false },
  });
  controller.showReasoning();
  controller.pause();
  controller.resume();
  expect(phase.state).toBe("reasoning");
  expect(display.render).toHaveBeenCalled();
  controller.clear();
  expect(phase.state).toBeNull();
});
