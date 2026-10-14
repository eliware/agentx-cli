export function prepareSessionInput({ oneShot, terminalInput }) {
  if (oneShot || !terminalInput?.isTTY) return;
  terminalInput.setRawMode?.(true);
  terminalInput.resume?.();
}
