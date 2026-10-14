export function handleRecoveryMenuAbort(error, deps) {
  if (error?.name !== "AbortError") return null;
  deps.terminalInput.setRawMode?.(false);
  deps.terminalInput.resume?.();
  deps.preserveReplHistory();
  deps.closeReadline();
  deps.setReadline(deps.createReadline());
  deps.writeSystem("Recovery cancelled; session preserved.");
  return { control: "end" };
}
