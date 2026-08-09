const STATUS_UPDATE_INTERVAL_MS = 250;
const STATUS_WHITE = '\u001b[38;5;255m';
const STATUS_GREEN = '\u001b[32m';
const RESET = '\u001b[0m';

export function formatElapsedStatus(elapsedMs) {
  const totalSeconds = Math.max(0, Math.round(Number(elapsedMs ?? 0) / 1000));
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }
  return `${totalSeconds}s`;
}

function stripStatusValue(value) {
  if (value && typeof value === 'object' && 'value' in value) return String(value.value ?? '');
  if (typeof value !== 'string') return String(value ?? '');
  return value.replace(/^([a-z]+):\s+/, '').replace(/\[[0-9;]*m/g, '');
}

// Produce a compact JSON message describing the transaction completion.
// Only include fields that have meaningful values; undefined or empty
// strings are omitted to avoid clutter in logs.
export function formatTransactionCompletionMessage(summary) {
  const obj = {};
  if (summary?.time !== undefined && summary.time !== '') {
    obj.time = String(summary.time);
  }
  const reasoning = stripStatusValue(summary?.reasoning);
  if (reasoning) {
    obj.reasoning = reasoning;
  }
  const writing = stripStatusValue(summary?.writing);
  if (writing) {
    obj.writing = writing;
  }
  const executing = stripStatusValue(summary?.executing);
  if (executing) {
    obj.executing = executing;
  }
  return JSON.stringify(obj);
}

export function formatSpinnerFrame() {
  return '';
}

export function createStatusLineController(sessionStartedAt = Date.now(), { quiet = false, transitionOnly = false } = {}) {
  let timer = null;
  let lastRendered = '';
  let state = null;
  let stateStartedAt = 0;
  let paused = false;
  let suppressStatusAfterOutput = false;
  const phases = {
    reasoning: { lastMs: 0, totalMs: 0 },
    executing: { lastMs: 0, totalMs: 0 },
    writing: { lastMs: 0, totalMs: 0 },
  };

  function clearRenderedLine() {
    // lastRendered is only set while the cursor is on our temporary status
    // line. Clear that line, then leave the cursor at its beginning so the
    // next status frame or streamed output owns the terminal position.
    if (quiet || transitionOnly || !lastRendered) return;
    process.stdout.write('\r\x1b[2K\r');
    lastRendered = '';
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startTimer() {
    if (quiet || transitionOnly || timer || paused) return;
    timer = setInterval(render, STATUS_UPDATE_INTERVAL_MS);
  }

  function finalizeActive(now = Date.now()) {
    if (!state) return;
    const elapsed = Math.max(0, now - stateStartedAt);
    const phase = phases[state];
    phase.lastMs = elapsed;
    phase.totalMs += elapsed;
  }

  function phaseSnapshot(name, now) {
    const phase = phases[name];
    const active = state === name;
    const elapsed = active ? Math.max(0, now - stateStartedAt) : phase.lastMs;
    const total = active ? phase.totalMs + elapsed : phase.totalMs;
    return {
      active,
      value: `${formatElapsedStatus(elapsed)}/${formatElapsedStatus(total)}`,
    };
  }

  function formatStatusField(name, snapshotValue) {
    const field = `"${name}":"${snapshotValue.value}"`;
    return snapshotValue.active ? `${STATUS_GREEN}${field}${STATUS_WHITE}` : field;
  }

  function snapshot(now = Date.now()) {
    return {
      time: formatElapsedStatus(now - sessionStartedAt),
      reasoning: phaseSnapshot('reasoning', now),
      writing: phaseSnapshot('writing', now),
      executing: phaseSnapshot('executing', now),
    };
  }

  function writeLine(text) {
    if (text === lastRendered) return;
    if (transitionOnly) {
      process.stdout.write(`${text}\n`);
      lastRendered = text;
      return;
    }
    clearRenderedLine();
    process.stdout.write(text);
    lastRendered = text;
  }

  function render() {
    if (quiet || paused || !state || state === 'writing') return;
    const stats = snapshot();
    writeLine(`${STATUS_WHITE}{"time":"${stats.time}",${formatStatusField('reasoning', stats.reasoning)},${formatStatusField('writing', stats.writing)},${formatStatusField('executing', stats.executing)}}${RESET}`);
  }

  function prepareOutput() {
    // Streamed command/text output can arrive while the controller is already
    // in the writing phase (for example after a tool event). In that case
    // transition() is a no-op, so explicitly remove the temporary status line
    // before writing output.
    clearRenderedLine();
  }

  function transition(nextState, { renderNow = true, allowStatusAfterOutput = false } = {}) {
    const now = Date.now();
    if (state === nextState) {
      if (!paused && renderNow && (transitionOnly || state !== 'writing')) render();
      return;
    }
    finalizeActive(now);
    state = nextState;
    stateStartedAt = now;
    if (nextState === 'writing') {
      stopTimer();
      clearRenderedLine();
      suppressStatusAfterOutput = true;
      return;
    }
    if (suppressStatusAfterOutput && !allowStatusAfterOutput) {
      stopTimer();
      clearRenderedLine();
      return;
    }
    suppressStatusAfterOutput = false;
    if (paused) return;
    startTimer();
    if (renderNow) render();
  }

  return {
    showReasoning(options) {
      transition('reasoning', options);
    },
    showExecuting(done, total, options) {
      transition('executing', options);
    },
    updateExecuting(_done, _total) {
      if (state !== 'executing' || paused) return;
      render();
    },
    beginWriting(options) {
      prepareOutput();
      transition('writing', options);
    },
    prepareOutput,
    pause() {
      paused = true;
      stopTimer();
      clearRenderedLine();
    },
    resume({ renderNow = true } = {}) {
      if (!paused) return;
      paused = false;
      if (state && state !== 'writing') {
        startTimer();
        if (renderNow) render();
      }
    },
    snapshot() {
      return snapshot();
    },
    isWriting() {
      return state === 'writing';
    },
    refresh() {
      render();
    },
    clear() {
      finalizeActive();
      stopTimer();
      // Clear the rendered status before dropping the phase state. If state is
      // reset first, clearRenderedLine() can no longer tell that writing has
      // started and may erase the final streamed response line.
      clearRenderedLine();
      state = null;
      stateStartedAt = 0;
      paused = false;
      suppressStatusAfterOutput = false;
    },
    stop() {
      // Failure path: unlike clear(), do not preserve a completion snapshot;
      // only stop future renders and remove the temporary terminal line.
      stopTimer();
      clearRenderedLine();
      state = null;
      stateStartedAt = 0;
      paused = true;
      suppressStatusAfterOutput = false;
    },
  };
}
