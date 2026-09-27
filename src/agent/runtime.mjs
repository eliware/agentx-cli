import { setTerminalOutputOptions, writeTerminal } from "../terminal-output.mjs";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { clearSession, persistResponseState } from "../conversation-state.mjs";
import { persistCheckpoint } from "../conversation-checkpoint.mjs";
import { extractTextFromResponse } from "../response.mjs";
import { appendCliTranscript } from "../request-context.mjs";
import { buildWorkingDirectoryNote, resolveCdTarget } from "../shell-paths.mjs";
import { formatPromptForCwd, formatSystemMessage } from "../shell-display.mjs";
import { loadPromptTemplate } from "../prompt-loader.mjs";
import { createUsageTotals, formatUsageReport } from "../response.mjs";
import { promptResumeMenu } from "../resume-menu.mjs";
import { promptRollbackMenu } from "../rollback-menu.mjs";
import { promptRecoveryMenu } from "../recovery-menu.mjs";
import {
  applySettings,
  formatStartupSettings,
  reloadSettings,
  settingsFromEnv,
} from "../settings.mjs";
import { runSetup } from "../setup.mjs";
import { confirmationFilePath, loadGlobalConfirmations } from "../confirmation-policy.mjs";
import {
  createReplInterface,
  printAgentText,
  printResumeMessage,
  printUsageReport,
} from "./repl.mjs";
import { createResumeToolCallRunner } from "./recovery.mjs";
import { createSessionPersistence } from "./conversation-persistence.mjs";
import { transitionGoalCommand } from "./goal-command-state.mjs";
import { bindAgentDebugListeners, createAgentClient } from "./client.mjs";
import { executeLocalShellCommand } from "./local-shell.mjs";
import { recreateOpenAIClient, waitForWebsocketRetry } from "../retry-recovery.mjs";
import {
  decideRecoveryMenuChoice,
  decideRequestFailure,
  isWebsocketRecoveryError,
} from "./request-recovery.mjs";
import { createInteractiveToolCallRunner } from "./interactive-tool-call.mjs";
import { prepareAgentSession } from "./session-bootstrap.mjs";
import { presentAgentSession } from "./session-presentation.mjs";
import { handleSessionImageGeneration } from "./session-image-generation.mjs";
import { createSessionToolConfirmer } from "./session-confirmation.mjs";
import { prepareSessionInput } from "./session-input.mjs";
import { recoverPendingSession, shouldRecoverPendingSession } from "./session-pending-recovery.mjs";
import { dispatchSessionInput } from "./session-input-dispatch.mjs";
import { createSessionCommandDispatcher } from "./session-command-dispatcher.mjs";
import { handleSessionPromptError } from "./session-prompt-errors.mjs";
import { shutdownAgentSession } from "./session-shutdown.mjs";
import { runSessionPromptLoop } from "./session-prompt-loop.mjs";
import { runSessionUserTurn } from "./session-user-turn.mjs";
import { runSessionRequestCycle } from "./session-request-cycle.mjs";
import { finalizeAgentTurn } from "./session-turn-finalization.mjs";
import { executePendingSessionTools } from "./session-pending-executor.mjs";
import { agentProcessLifecycle } from "./process-lifecycle.mjs";
import { createSessionRepl } from "./session-repl.mjs";
import { exitSessionWithSummary } from "./session-exit.mjs";
import { reportSessionWorkerUsage } from "./session-worker-usage.mjs";

const { signalRegistration } = agentProcessLifecycle;

export async function runAgent({
  promptPath,
  cwd,
  input: terminalInput = defaultInput,
  output: terminalOutput = defaultOutput,
  initialMessage = null,
  oneShot = false,
  flags = null,
} = {}) {
  const session = await prepareAgentSession({ promptPath, cwd, oneShot, flags });
  const {
    outputFlags,
    checkpointPath,
    statePath,
    savedState,
    savedResponseId,
    restoredSession,
    apiKey,
    agentsText,
  } = session;
  setTerminalOutputOptions({ colors: !outputFlags.noColors });
  let template = session.template;
  let debugEnabled = Boolean(outputFlags.debug);
  const yoloEnabled = !outputFlags.confirm;
  const createSessionClient = () => {
    return createAgentClient({ apiKey, isDebugEnabled: () => debugEnabled });
  };
  let openai = createSessionClient();
  agentProcessLifecycle.setActiveClient(openai);

  presentAgentSession({
    outputFlags,
    savedState,
    savedResponseId,
    restoredSession,
    agentsText,
    oneShot,
    settings: outputFlags.quiet ? "" : formatStartupSettings(settingsFromEnv()),
    formatSystemMessage,
    write: writeTerminal,
    printResumeMessage,
  });
  let previousResponseId = restoredSession.previousResponseId;
  let cwdNote = "";
  let previousCwd = null;
  let lastUserMessage = restoredSession.lastUserMessage;
  let lastAssistantMessage = restoredSession.lastAssistantMessage;
  let pendingCliTranscript = restoredSession.pendingCliTranscript;
  const onWorkerComplete = (worker) =>
    reportSessionWorkerUsage({
      worker,
      noUsage: outputFlags.noUsage,
      model: template?.model,
      formatUsageReport,
      write: writeTerminal,
    });
  let sessionUsage = restoredSession.sessionUsage;
  let pendingToolCalls = restoredSession.pendingToolCalls;
  let executionJournal = restoredSession.executionJournal;
  let history = restoredSession.history;
  let rollbackBackup = restoredSession.rollbackBackup;
  let failedResponse = restoredSession.failedResponse;
  let pendingRetryRequest = restoredSession.pendingRetryRequest;
  let pendingTransaction = restoredSession.pendingTransaction;
  let activeGoal = restoredSession.activeGoal;
  const globalConfirmationPath = confirmationFilePath();
  const globalConfirmations = await loadGlobalConfirmations(globalConfirmationPath);
  const sessionConfirmations = new Set();
  // Resume may execute confirmation-gated tools before entering the prompt loop.
  // Initialize readline first so confirmToolCall never hits the TDZ.
  const repl = createSessionRepl({
    oneShot,
    getCwd: () => cwd,
    input: terminalInput,
    output: terminalOutput,
    createInterface: createReplInterface,
  });

  const sessionPersistence = createSessionPersistence({
    statePath,
    checkpointPath,
    oneShot,
    getState: () => ({
      response_id: previousResponseId,
      usage: sessionUsage,
      last_user_message: lastUserMessage,
      last_assistant_message: lastAssistantMessage,
      pending_tool_calls: pendingToolCalls,
      history,
      failed_response: failedResponse,
      pending_retry_request: pendingRetryRequest,
      pending_transaction: pendingTransaction,
      pending_cli_transcript: pendingCliTranscript,
      execution_journal: executionJournal,
      rollback_backup: rollbackBackup,
      goal: activeGoal,
    }),
    setState: (state) => {
      previousResponseId = state.response_id;
      sessionUsage = state.usage;
      lastUserMessage = state.last_user_message;
      lastAssistantMessage = state.last_assistant_message;
      pendingCliTranscript = state.pending_cli_transcript;
      pendingToolCalls = state.pending_tool_calls;
      executionJournal = state.execution_journal;
      history = state.history;
      rollbackBackup = state.rollback_backup;
      failedResponse = state.failed_response;
      pendingRetryRequest = state.pending_retry_request;
      pendingTransaction = state.pending_transaction;
      activeGoal = state.goal;
    },
    persistResponseState,
    persistCheckpoint,
    extractAssistantText: extractTextFromResponse,
  });
  const {
    saveState,
    persistResponseSnapshot,
    persistToolExecutionState,
    resetState,
    applyRollback,
  } = sessionPersistence;
  const handleImageGeneration = handleSessionImageGeneration({
    getTranscript: () => pendingCliTranscript,
    setTranscript: (value) => {
      pendingCliTranscript = value;
    },
    saveState,
  });
  if (savedState?.goal) await saveState();

  const confirmToolCall = createSessionToolConfirmer({
    oneShot,
    isTTY: terminalInput?.isTTY,
    getReadline: repl.getReadline,
    sessionConfirmations,
    globalConfirmations,
    globalConfirmationPath,
  });

  const exitWithSummary = ({ leadingNewline = false } = {}) =>
    exitSessionWithSummary({
      noUsage: outputFlags.noUsage,
      usage: sessionUsage,
      model: template.model,
      leadingNewline,
      readline: repl.getReadline(),
      printUsageReport,
    });

  if (shouldRecoverPendingSession({ previousResponseId, pendingToolCalls, oneShot })) {
    await recoverPendingSession({
      savedState,
      input: terminalInput,
      output: terminalOutput,
      getState: sessionPersistence.getState,
      setState: sessionPersistence.setState,
      execute: (runPendingToolCall) =>
        executePendingSessionTools(runPendingToolCall, {
          savedState,
          oneShot,
          outputFlags,
          terminalInput,
          yoloEnabled,
          getOpenAI: () => openai,
          getTemplate: () => template,
          getCwd: () => cwd,
          getUsage: () => sessionUsage,
          getDebugEnabled: () => debugEnabled,
          persistResponseSnapshot,
          persistToolExecutionState,
          confirmToolCall,
          handleImageGeneration,
          onWorkerComplete,
          now: Date.now,
        }),
      deps: {
        promptResumeMenu,
        createUsageTotals,
        createRunner: createResumeToolCallRunner,
        saveState,
        persistCheckpoint: (checkpoint) => persistCheckpoint(checkpointPath, checkpoint),
        writeSystem: (text) => writeTerminal(`${formatSystemMessage(text)}\n`),
        resetState,
        clearSession: () => clearSession(statePath),
        extractAssistantText: extractTextFromResponse,
      },
    });
  }

  const runInteractiveToolCall = createInteractiveToolCallRunner({
    oneShot,
    terminalInput,
    preserveHistory: repl.preserveHistory,
    closeReadline: repl.close,
    replaceReadline: repl.replace,
  });

  const dispatchCommand = createSessionCommandDispatcher({
    state: {
      getActiveGoal: () => activeGoal,
      setActiveGoal: (value) => {
        activeGoal = value;
      },
      getTemplate: () => template,
      setTemplate: (value) => {
        template = value;
      },
      getCwd: () => cwd,
      setCwd: (value) => {
        cwd = value;
      },
      getPreviousCwd: () => previousCwd,
      setPreviousCwd: (value) => {
        previousCwd = value;
      },
      setCwdNote: (value) => {
        cwdNote = value;
      },
      getSessionUsage: () => sessionUsage,
      getHistory: () => history,
    },
    context: {
      promptPath,
      outputFlags,
      input: terminalInput,
      output: terminalOutput,
      statePath,
      checkpointPath,
    },
    repl: {
      getReadline: repl.getReadline,
      preserveHistory: repl.preserveHistory,
      createReadline: repl.createReadline,
      setReadline: repl.setReadline,
    },
    services: {
      transitionGoalCommand,
      runSetup,
      applySettings,
      loadPromptTemplate,
      reloadSettings,
      write: writeTerminal,
      formatMessage: formatSystemMessage,
      printError: printAgentText,
      saveState,
      writeSystem: (text) => writeTerminal(`${formatSystemMessage(text)}\n`),
      exitWithSummary,
      printUsageReport,
      resetState,
      createUsageTotals,
      clearSession,
      promptRollback: promptRollbackMenu,
      applyRollback,
      persistCheckpoint: (checkpoint) => persistCheckpoint(checkpointPath, checkpoint),
      resolveCdTarget,
      buildWorkingDirectoryNote,
    },
  });
  const userTurnSession = {
    oneShot,
    checkpointPath,
    statePath,
    exitWithSummary,
    getPersistedState: sessionPersistence.getState,
    setPersistedState: sessionPersistence.setState,
    saveState,
    persistCheckpoint,
    clearSession,
    getPendingCliTranscript: () => pendingCliTranscript,
    getCwdNote: () => cwdNote,
    setCwdNote: (value) => {
      cwdNote = value;
    },
    setLastUserMessage: (value) => {
      lastUserMessage = value;
    },
    getOpenAI: () => openai,
    setOpenAI: (value) => {
      openai = value;
    },
    getPreviousResponseId: () => previousResponseId,
    setPreviousResponseId: (value) => {
      previousResponseId = value;
    },
    getPendingRetryRequest: () => pendingRetryRequest,
    setPendingRetryRequest: (value) => {
      pendingRetryRequest = value;
    },
    getPendingTransaction: () => pendingTransaction,
    setPendingTransaction: (value) => {
      pendingTransaction = value;
    },
    getPendingToolCalls: () => pendingToolCalls,
    setPendingToolCalls: (value) => {
      pendingToolCalls = value;
    },
    getFailedResponse: () => failedResponse,
    setFailedResponse: (value) => {
      failedResponse = value;
    },
    getDebugEnabled: () => debugEnabled,
    setDebugEnabled: (value) => {
      debugEnabled = value;
    },
    requestContext: {
      oneShot,
      agentsText,
      terminalInput,
      terminalOutput,
      outputFlags,
      yoloEnabled,
      statePath,
      checkpointPath,
      createSessionClient,
      recoveryDependencies: {
        isWebsocketRecoveryError,
        waitForWebsocketRetry,
        decideRequestFailure,
        decideRecoveryMenuChoice,
        recreateOpenAIClient,
        setActiveOpenAI: agentProcessLifecycle.setActiveClient,
        writeSystem: (text) => writeTerminal(`${formatSystemMessage(text)}\n`),
        writeDebugEnabled: () => process.stderr.write("[agentx:debug] enabled for retry\n"),
        saveState,
        promptRecoveryMenu,
        terminalInput,
        preserveReplHistory: repl.preserveHistory,
        closeReadline: repl.close,
        createReadline: repl.createReadline,
        setReadline: repl.setReadline,
        bindDebugListeners: bindAgentDebugListeners,
        promptRollback: promptRollbackMenu,
        applyRollback,
        persistCheckpoint,
        resetState,
        createUsageTotals,
        clearSession,
      },
      getTemplate: () => template,
      getGoal: () => activeGoal,
      setGoal: (goal) => {
        activeGoal = goal;
      },
      getCwd: () => cwd,
      getOpenAI: () => openai,
      getSessionUsage: () => sessionUsage,
      getPendingTransaction: () => pendingTransaction,
      getPendingToolCalls: () => pendingToolCalls,
      getExecutionJournal: () => executionJournal,
      setPendingRetryRequest: (request) => {
        pendingRetryRequest = request;
      },
      setPendingTransaction: (transaction) => {
        pendingTransaction = transaction;
      },
      saveState,
      getReadline: repl.getReadline,
      persistResponseSnapshot,
      persistToolExecutionState,
      confirmToolCall,
      getDebugEnabled: () => debugEnabled,
      runInteractiveToolCall,
      handleImageGeneration,
      onWorkerComplete,
      replaceReplInterface: repl.replace,
      getHistory: () => history,
    },
  };

  try {
    await runSessionPromptLoop({
      oneShot,
      initialMessage,
      readPrompt: async () => {
        prepareSessionInput({ oneShot, terminalInput });
        return repl.getReadline().question(formatPromptForCwd(cwd));
      },
      handlePromptError: (error) =>
        handleSessionPromptError(error, {
          getGoal: () => activeGoal,
          setGoal: (goal) => {
            activeGoal = goal;
          },
          saveState,
          write: writeTerminal,
          formatMessage: formatSystemMessage,
          exitWithSummary,
        }),
      dispatchInput: (line) =>
        dispatchSessionInput({
          message: line,
          cwd,
          input: terminalInput,
          readline: repl.getReadline(),
          oneShot,
          state: {
            get pendingCliTranscript() {
              return pendingCliTranscript;
            },
            set pendingCliTranscript(value) {
              pendingCliTranscript = value;
            },
          },
          deps: {
            appendCliTranscript,
            executeLocalShellCommand,
            preserveHistory: repl.preserveHistory,
            replaceReadline: repl.replace,
            writeSystem: (text) => writeTerminal(`${formatSystemMessage(text)}\n`),
            saveState,
            dispatchCommand,
          },
        }),
      processMessage: (message) =>
        runSessionUserTurn({
          message,
          session: userTurnSession,
          deps: {
            now: Date.now,
            runRequestCycle: runSessionRequestCycle,
            finalizeTurn: finalizeAgentTurn,
            printAgentText,
            extractAssistantText: extractTextFromResponse,
          },
        }),
    });
  } finally {
    await shutdownAgentSession({
      readline: repl.getReadline(),
      client: openai,
      signalRegistration,
      deps: {
        clearActiveClient: agentProcessLifecycle.clearActiveClient,
        terminateWorkers: agentProcessLifecycle.terminateWorkers,
        restoreTerminalOutput: () => setTerminalOutputOptions({ colors: true }),
      },
    });
  }
}
