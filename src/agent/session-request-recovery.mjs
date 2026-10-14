import { handleRecoveryMenuAbort } from "./recovery-menu-abort.mjs";
import { isWebsocketRetryAvailable } from "./session-websocket-recovery.mjs";
import { applySessionRecoveryAction } from "./session-recovery-actions.mjs";
import { applyRequestFailureState, applyRecoveryMenuState } from "./session-recovery-state.mjs";

export async function resolveSessionRequestFailure({
  error,
  state,
  oneShot,
  history = [],
  statePath,
  checkpointPath,
  input,
  output,
  createSessionClient,
  now = Date.now,
  deps,
}) {
  const websocketRetryAvailable = await isWebsocketRetryAvailable(error, state, now, deps);
  const recovery = deps.decideRequestFailure(error, {
    oneShot,
    recoveryAttempts: state.recoveryAttempts,
    previousResponseId: state.previousResponseId,
    websocketRetryAvailable,
  });
  applyRecoveryMenuState(state, recovery);

  if (recovery.action === "reconnect") {
    state.websocketRecoveryAttempts += 1;
    state.openai = await deps.recreateOpenAIClient(state.openai, createSessionClient);
    deps.setActiveOpenAI(state.openai);
    deps.writeSystem("Responses connection expired; reconnecting.");
    return { control: "retry" };
  }
  if (recovery.action === "new-chain") {
    state.clearPendingContinuationForNewChain();
    await deps.saveState();
    deps.writeSystem("Previous response not found; starting a new chain.");
    return { control: "retry" };
  }

  applyRequestFailureState(state, recovery);
  await deps.saveState();
  if (oneShot) {
    if (recovery.action === "retry-pending") {
      state.retryRequest = state.pendingRetryRequest;
      return { control: "retry" };
    }
    return { control: "throw", error };
  }

  let choice;
  try {
    choice = await deps.promptRecoveryMenu(error, { input, output });
  } catch (menuError) {
    const recovery = handleRecoveryMenuAbort(menuError, deps);
    if (recovery) return recovery;
    throw menuError;
  }

  const menuRecovery = deps.decideRecoveryMenuChoice(choice, {
    recoveryAttempts: state.recoveryAttempts,
    newChainAttempts: state.newChainAttempts,
  });
  applyRecoveryMenuState(state, menuRecovery);
  return applySessionRecoveryAction({
    action: menuRecovery.action,
    state,
    createSessionClient,
    history,
    input,
    output,
    checkpointPath,
    statePath,
    deps,
  });
}
