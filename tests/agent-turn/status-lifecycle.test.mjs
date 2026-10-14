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

test("holds paused phases and honors transitions that skip rendering", () => {
  const pausedPhase = {
    state: null,
    setState(next) {
      this.state = next;
    },
    reset() {
      this.state = null;
    },
  };
  const pausedDisplay = { clear: jest.fn(), render: jest.fn(), prepareOutput: jest.fn() };
  const paused = createStatusLifecycle({
    phase: pausedPhase,
    display: pausedDisplay,
    quiet: false,
    transitionOnly: false,
    state: { paused: true },
  });
  paused.showReasoning();
  expect(pausedPhase.state).toBe("reasoning");
  expect(pausedDisplay.render).not.toHaveBeenCalled();
  paused.stop();

  const phase = {
    state: null,
    setState(next) {
      this.state = next;
    },
    reset() {
      this.state = null;
    },
  };
  const display = { clear: jest.fn(), render: jest.fn(), prepareOutput: jest.fn() };
  const controller = createStatusLifecycle({
    phase,
    display,
    quiet: false,
    transitionOnly: false,
    state: { paused: false },
  });
  controller.showReasoning({ renderNow: false });
  expect(phase.state).toBe("reasoning");
  expect(display.render).not.toHaveBeenCalled();
  controller.stop();
});

test("starts status timers and resumes after output suppression", () => {
  jest.useFakeTimers();
  try {
    const phase = {
      state: null,
      setState(next) {
        this.state = next;
      },
      snapshot: jest.fn(() => ({ state: phase.state })),
      finalize: jest.fn(),
      reset() {
        this.state = null;
      },
    };
    const display = { clear: jest.fn(), render: jest.fn(), prepareOutput: jest.fn() };
    const state = { paused: false };
    const controller = createStatusLifecycle({
      phase,
      display,
      quiet: false,
      transitionOnly: false,
      state,
    });
    controller.resume();
    controller.showReasoning();
    controller.showReasoning();
    jest.advanceTimersByTime(250);
    expect(display.render).toHaveBeenCalledTimes(3);
    controller.showExecuting();
    controller.updateExecuting();
    controller.beginWriting();
    controller.beginWriting();
    controller.showReasoning();
    controller.showReasoning({ allowStatusAfterOutput: true });
    controller.showExecuting({ allowStatusAfterOutput: true });
    expect(controller.isWriting()).toBe(false);
    expect(controller.snapshot()).toEqual({ state: "executing" });
    controller.pause();
    controller.showReasoning();
    controller.updateExecuting();
    controller.resume({ renderNow: false });
    controller.refresh();
    controller.clear();
    expect(phase.finalize).toHaveBeenCalled();
    controller.stop();
    expect(state.paused).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
