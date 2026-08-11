import stripAnsi from 'strip-ansi';

let activeStatusController = null;
let colorsEnabled = true;

export function setTerminalOutputOptions({ colors = true } = {}) {
  colorsEnabled = Boolean(colors);
}

export function isTerminalColorEnabled() {
  return colorsEnabled;
}

export function setActiveStatusController(controller) {
  activeStatusController = controller || null;
}

export function writeTerminal(text, statusController = activeStatusController) {
  const output = colorsEnabled ? text : stripAnsi(text);
  if (!statusController) {
    process.stdout.write(output);
    return;
  }
  statusController.pause?.();
  try {
    process.stdout.write(output);
  } finally {
    statusController.resume?.({ renderNow: false });
  }
}
