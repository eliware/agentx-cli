const STATUS_UPDATE_INTERVAL_MS = 250;

export function createStatusLifecycle({ phase, display, quiet, transitionOnly, state }) {
  let timer = null;
  let suppressStatusAfterOutput = false;
  const startTimer = () => {
    if (!quiet && !transitionOnly && !timer && !state.paused)
      timer = setInterval(display.render, STATUS_UPDATE_INTERVAL_MS);
  };
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  function transition(nextState, { renderNow = true, allowStatusAfterOutput = false } = {}) {
    if (phase.state === nextState) {
      if (!state.paused && renderNow && (transitionOnly || phase.state !== "writing"))
        display.render();
      return;
    }
    phase.setState(nextState);
    if (nextState === "writing") {
      stopTimer();
      display.clear();
      suppressStatusAfterOutput = true;
      return;
    }
    if (suppressStatusAfterOutput && !allowStatusAfterOutput) {
      stopTimer();
      display.clear();
      return;
    }
    suppressStatusAfterOutput = false;
    if (state.paused) return;
    startTimer();
    if (renderNow) display.render();
  }
  return {
    showReasoning(options) {
      transition("reasoning", options);
    },
    showExecuting(_done, _total, options) {
      transition("executing", options);
    },
    updateExecuting(_done, _total) {
      if (phase.state === "executing" && !state.paused) display.render();
    },
    beginWriting(options) {
      display.prepareOutput();
      transition("writing", options);
    },
    prepareOutput: display.prepareOutput,
    pause() {
      state.paused = true;
      stopTimer();
      display.clear();
    },
    resume({ renderNow = true } = {}) {
      if (!state.paused) return;
      state.paused = false;
      if (phase.state && phase.state !== "writing") {
        startTimer();
        if (renderNow) display.render();
      }
    },
    snapshot: phase.snapshot,
    isWriting: () => phase.state === "writing",
    refresh: display.render,
    clear() {
      phase.finalize();
      stopTimer();
      display.clear();
      phase.reset();
      state.paused = false;
      suppressStatusAfterOutput = false;
    },
    stop() {
      stopTimer();
      display.clear();
      phase.reset();
      state.paused = true;
      suppressStatusAfterOutput = false;
    },
  };
}
