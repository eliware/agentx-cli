import { writeTerminal } from "../terminal-output.mjs";
import { formatSystemMessage } from "../shell-display.mjs";
import { promptRecoveryMenu } from "../recovery-menu.mjs";
import { promptRollbackMenu } from "../rollback-menu.mjs";
import { createUsageTotals } from "../response.mjs";
import { bindAgentDebugListeners } from "./client.mjs";
import { recreateOpenAIClient, waitForWebsocketRetry } from "../retry-recovery.mjs";
import {
  decideRecoveryMenuChoice,
  decideRequestFailure,
  isWebsocketRecoveryError,
} from "./request-recovery.mjs";

export function createAgentRecoveryContext({ input, repl, callbacks, applyRollback, resetState }) {
  return {
    isWebsocketRecoveryError,
    waitForWebsocketRetry,
    decideRequestFailure,
    decideRecoveryMenuChoice,
    recreateOpenAIClient,
    setActiveOpenAI: callbacks.setActiveOpenAI,
    writeSystem: (text) => writeTerminal(`${formatSystemMessage(text)}\n`),
    writeDebugEnabled: () => process.stderr.write("[agentx:debug] enabled for retry\n"),
    saveState: callbacks.saveState,
    promptRecoveryMenu,
    terminalInput: input,
    preserveReplHistory: repl.preserveHistory,
    closeReadline: repl.close,
    createReadline: repl.createReadline,
    setReadline: repl.setReadline,
    bindDebugListeners: bindAgentDebugListeners,
    promptRollback: promptRollbackMenu,
    applyRollback,
    persistCheckpoint: callbacks.persistCheckpoint,
    resetState,
    createUsageTotals,
    clearSession: callbacks.clearSession,
  };
}
