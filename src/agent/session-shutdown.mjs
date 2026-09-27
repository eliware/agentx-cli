export async function shutdownAgentSession({ readline, client, signalRegistration, deps }) {
  readline?.close?.();
  try {
    await client?.responses?.close?.();
  } catch {
    // Closing the client is best effort during process teardown.
  }
  deps.clearActiveClient();
  await deps.terminateWorkers();
  signalRegistration.removeHandlers?.();
  deps.restoreTerminalOutput();
}
