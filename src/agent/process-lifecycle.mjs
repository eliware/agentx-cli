import { log, registerHandlers, registerSignals } from "@eliware/common";
import { terminateWorkers } from "../parallel-workers.mjs";

export function createAgentProcessLifecycle({
  logger = log,
  registerLogHandlers = registerHandlers,
  registerSignalHandlers = registerSignals,
  terminateActiveWorkers = terminateWorkers,
} = {}) {
  let activeClient = null;
  registerLogHandlers({ log: logger });
  const signalRegistration = registerSignalHandlers({
    log: logger,
    shutdownHook: async () => {
      try {
        await activeClient?.responses?.close?.();
      } catch {
        // Shutdown is best effort.
      }
      await terminateActiveWorkers();
    },
  });
  return {
    signalRegistration,
    setActiveClient: (client) => {
      activeClient = client;
    },
    clearActiveClient: () => {
      activeClient = null;
    },
    terminateWorkers: terminateActiveWorkers,
  };
}

export const agentProcessLifecycle = createAgentProcessLifecycle();
