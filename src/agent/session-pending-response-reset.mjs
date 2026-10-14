export async function resetPendingResponseSession(deps) {
  deps.writeSystem("Pending response not found; clearing session");
  deps.resetState(deps.createUsageTotals());
  await deps.clearSession();
}
