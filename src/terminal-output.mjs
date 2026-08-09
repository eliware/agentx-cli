let activeStatusController = null;

export function setActiveStatusController(controller) {
  activeStatusController = controller || null;
}

export function writeTerminal(text, statusController = activeStatusController) {
  if (!statusController) {
    process.stdout.write(text);
    return;
  }
  statusController.pause?.();
  try {
    process.stdout.write(text);
  } finally {
    statusController.resume?.({ renderNow: false });
  }
}
