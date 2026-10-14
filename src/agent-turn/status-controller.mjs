import { createStatusDisplay } from "./status-display.mjs";
import { createStatusLifecycle } from "./status-lifecycle.mjs";
import { createStatusPhaseState } from "./status-phase-state.mjs";

export function formatSpinnerFrame() {
  return "";
}

export function createStatusLineController(
  sessionStartedAt = Date.now(),
  { quiet = false, transitionOnly = false, colors = true } = {},
) {
  const phase = createStatusPhaseState(sessionStartedAt);
  const state = { paused: false };
  const display = createStatusDisplay({
    quiet,
    transitionOnly,
    colors,
    snapshot: () => phase.snapshot(),
    getState: () => phase.state,
    isPaused: () => state.paused,
    writeOutput: (text) => process.stdout.write(text),
  });
  return createStatusLifecycle({ phase, display, quiet, transitionOnly, state });
}
