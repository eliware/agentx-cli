import { formatElapsedStatus } from "./status-format.mjs";

export function createStatusPhaseState(sessionStartedAt) {
  let state = null;
  let stateStartedAt = 0;
  const phases = {
    reasoning: { lastMs: 0, totalMs: 0 },
    executing: { lastMs: 0, totalMs: 0 },
    writing: { lastMs: 0, totalMs: 0 },
  };
  function finalize(now = Date.now()) {
    if (!state) return;
    const phase = phases[state];
    phase.lastMs = Math.max(0, now - stateStartedAt);
    phase.totalMs += phase.lastMs;
  }
  function snapshot(now = Date.now()) {
    const phaseSnapshot = (name) => {
      const phase = phases[name];
      const active = state === name;
      const elapsed = active ? Math.max(0, now - stateStartedAt) : phase.lastMs;
      return {
        active,
        value: `${formatElapsedStatus(elapsed)}/${formatElapsedStatus(
          active ? phase.totalMs + elapsed : phase.totalMs,
        )}`,
      };
    };
    return {
      time: formatElapsedStatus(now - sessionStartedAt),
      reasoning: phaseSnapshot("reasoning"),
      writing: phaseSnapshot("writing"),
      executing: phaseSnapshot("executing"),
    };
  }
  return {
    get state() {
      return state;
    },
    finalize,
    setState(next, now = Date.now()) {
      finalize(now);
      state = next;
      stateStartedAt = now;
    },
    snapshot,
    reset() {
      state = null;
      stateStartedAt = 0;
    },
  };
}
