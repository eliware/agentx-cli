export function hasInteractiveSetupTerminal(stdin, stdout) {
  return Boolean(stdin?.isTTY && stdout?.isTTY);
}
