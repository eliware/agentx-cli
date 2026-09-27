import { setTerminalOutputOptions, writeTerminal } from "../terminal-output.mjs";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { log, registerHandlers, registerSignals, path } from "@eliware/common";
import { clearSession, persistResponseState, readSessionState } from "../conversation-state.mjs";
import { cleanupStaleOneShotStates } from "../conversation-state-cleanup.mjs";
import { persistCheckpoint, readLatestCheckpoint } from "../conversation-checkpoint.mjs";
import { extractTextFromResponse } from "../response.mjs";
import { handleToolCalls } from "../agent-turn/tool-loop.mjs";
import { sendMessage } from "../agent-turn/response-service.mjs";
import { buildWorkingDirectoryNote, resolveCdTarget } from "../shell-paths.mjs";
import { formatPromptForCwd, formatSystemMessage } from "../shell-display.mjs";
import { parseInternalCommand } from "../shell-commands.mjs";
import { readAgentsFromCwdAndParents } from "../shell-agents.mjs";
import { createUsageTotals, addUsageTotals, formatUsageReport } from "../response.mjs";
import { appendCliTranscript, buildRequestMessage } from "../request-context.mjs";
import { buildRequestOverride, withGoalTools, WORKER_ROLE_MESSAGE } from "../request-builder.mjs";
import { loadPromptTemplate } from "../prompt-loader.mjs";
import { resolveAgentApiKey } from "./client.mjs";
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
import {
  confirmationKey,
  confirmationFilePath,
  loadGlobalConfirmations,
  saveGlobalConfirmations,
} from "../confirmation-policy.mjs";
import { terminateWorkers } from "../parallel-workers.mjs";
import { createPendingResponse, getToolCallId } from "./pending-response.mjs";
import {
  createReplInterface,
  printAgentText,
  printResumeMessage,
  printUsageReport,
} from "./repl.mjs";
import { createResumeToolCallRunner } from "./recovery.mjs";
import { createSessionPersistence } from "./conversation-persistence.mjs";
import { restoreSessionState } from "./conversation-transitions.mjs";
import { transitionGoalCommand } from "./goal-command-state.mjs";
import { executeLocalShellCommand } from "./local-shell.mjs";
import { bindAgentDebugListeners, createAgentClient } from "./client.mjs";
import { inspectImage } from "../image-inspector.mjs";
import { saveGeneratedImage } from "../image-generation.mjs";
import { recreateOpenAIClient, waitForWebsocketRetry } from "../retry-recovery.mjs";
import {
  decideRecoveryMenuChoice,
  decideRequestFailure,
  isWebsocketRecoveryError,
} from "./request-recovery.mjs";
import { createGoalCallbacks } from "./goal-callbacks.mjs";
import { createInteractiveToolCallRunner } from "./interactive-tool-call.mjs";
import { parseCliArgs } from "../cli-args.mjs";
import { normalizeOutputFlags } from "../cli-flags.mjs";

registerHandlers({ log });
let activeOpenAI = null;
const signalRegistration = registerSignals({
  log,
  shutdownHook: async () => {
    try {
      await activeOpenAI?.responses?.close?.();
    } catch {
      /* shutdown is best effort */
    }
    await terminateWorkers();
  },
});

export async function runAgent({
  promptPath,
  cwd,
  input: terminalInput = defaultInput,
  output: terminalOutput = defaultOutput,
  initialMessage = null,
  oneShot = false,
  flags = null,
} = {}) {
  const launchCwd = cwd;
  const outputFlags = normalizeOutputFlags({
    ...parseCliArgs(process.argv.slice(2)).flags,
    ...flags,
  });
  setTerminalOutputOptions({ colors: !outputFlags.noColors });
  const sessionStatePath = path(launchCwd, ".agentx_responseid");
  await cleanupStaleOneShotStates(launchCwd);
  const checkpointPath = path(launchCwd, ".agentx_checkpoint");
  const statePath = oneShot
    ? `${sessionStatePath}.oneshot-${process.pid}-${Date.now()}`
    : sessionStatePath;
  let template = applySettings(
    await loadPromptTemplate(promptPath, undefined, process.env, { loadMcp: !outputFlags.noMcp }),
    settingsFromEnv(),
  );
  const agentsText = await readAgentsFromCwdAndParents(cwd).catch((error) => {
    throw new Error(
      `Unable to read AGENTS.md files under ${cwd}: ${error?.message || String(error)}`,
    );
  });
  const savedState = oneShot
    ? (await readLatestCheckpoint(checkpointPath, sessionStatePath)) || null
    : await readSessionState(statePath);
  const savedResponseId = savedState?.response_id || "";
  const restoredSession = restoreSessionState(savedState, createUsageTotals);
  const apiKey =
    process.env.agentx_api_key ||
    process.env.AGENTX_API_KEY ||
    (process.env.JEST_WORKER_ID ? "test-key" : resolveAgentApiKey());
  let debugEnabled = Boolean(outputFlags.debug);
  const yoloEnabled = !outputFlags.confirm;
  const createSessionClient = () => {
    return createAgentClient({ apiKey, isDebugEnabled: () => debugEnabled });
  };
  let openai = createSessionClient();
  activeOpenAI = openai;

  if (!outputFlags.quiet) writeTerminal(`${formatStartupSettings(settingsFromEnv())}\n`);
  if (!outputFlags.quiet && !agentsText)
    writeTerminal(
      `${formatSystemMessage("AGENTS.md not found; ask AgentX to generate one for this project.")}\n`,
    );
  if (!outputFlags.quiet)
    writeTerminal(
      `${formatSystemMessage(savedResponseId ? `${oneShot ? "Branching from checkpoint" : "Resuming conversation"} ${savedResponseId}` : "Starting new session")}\n`,
    );
  if (!oneShot) {
    printResumeMessage("Last user message", savedState?.last_user_message || "");
    printResumeMessage("Last assistant message", savedState?.last_assistant_message || "");
  }
  const { hasPendingTransaction } = restoredSession;
  if (savedState?.failed_response) {
    const message = hasPendingTransaction
      ? "Previous continuation failed; pending tool transaction preserved for recovery."
      : "Previous request failed; starting from the last successful checkpoint.";
    writeTerminal(`${formatSystemMessage(message)}\n`);
  }
  let previousResponseId = restoredSession.previousResponseId;
  let cwdNote = "";
  let previousCwd = null;
  let lastUserMessage = restoredSession.lastUserMessage;
  let lastAssistantMessage = restoredSession.lastAssistantMessage;
  let pendingCliTranscript = restoredSession.pendingCliTranscript;
  const onWorkerComplete = (worker) => {
    if (!worker?.usage) return;
    if (outputFlags.noUsage) return;
    const usage = formatUsageReport({ ...worker.usage, model: template?.model });
    writeTerminal(`\u001b[38;5;33m${usage}\u001b[0m\n`);
  };
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
  let replHistory = [];
  let rl = oneShot
    ? null
    : createReplInterface(() => cwd, terminalInput, terminalOutput, replHistory);
  const preserveReplHistory = () => {
    if (Array.isArray(rl?.history)) replHistory = [...rl.history];
  };
  const replaceReplInterface = () => {
    preserveReplHistory();
    rl?.close?.();
    rl = createReplInterface(() => cwd, terminalInput, terminalOutput, replHistory);
  };

  async function handleImageGeneration({ item }) {
    try {
      const filePath = await saveGeneratedImage(item);
      pendingCliTranscript = appendCliTranscript(pendingCliTranscript, "generated image", filePath);
      writeTerminal(`${formatSystemMessage(`Generated image saved: ${filePath}`)}\n`);
      await saveState();
      return `Generated image saved to ${filePath}`;
    } catch (error) {
      const message = `Unable to save generated image: ${error?.message || String(error)}`;
      writeTerminal(`${formatSystemMessage(message)}\n`);
      return message;
    }
  }

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
  if (savedState?.goal) await saveState();
  if (activeGoal?.status === "paused" && !oneShot) {
    writeTerminal(
      `${formatSystemMessage(`Paused goal: ${activeGoal.text}. Use /goal resume to continue.`)}\n`,
    );
  }

  async function confirmToolCall(call, toolCwd) {
    const key = confirmationKey(call, toolCwd);
    if (sessionConfirmations.has(key) || globalConfirmations.has(key)) return true;
    if (oneShot || !terminalInput?.isTTY) return false;
    const summary = String(call?.action?.commands ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const answer = await rl.question(
      `Allow state-changing command: ${summary} [y]es/[n]o/[s]ession/[g]lobal: `,
    );
    const choice = answer.trim().toLowerCase();
    if (choice === "s" || choice === "session") {
      sessionConfirmations.add(key);
      return true;
    }
    if (choice === "g" || choice === "global") {
      globalConfirmations.add(key);
      await saveGlobalConfirmations(globalConfirmations, globalConfirmationPath);
      return true;
    }
    return choice === "y" || choice === "yes";
  }

  async function exitWithSummary({ leadingNewline = false } = {}) {
    if (!outputFlags.noUsage)
      printUsageReport(sessionUsage, { leadingNewline, model: template.model });
    rl?.close?.();
    process.exit(0);
  }

  const hasPendingToolCalls = Boolean(previousResponseId && pendingToolCalls.length > 0);
  if (hasPendingToolCalls && !oneShot) {
    const resumeChoice = await promptResumeMenu(savedState, {
      input: terminalInput,
      output: terminalOutput,
    });

    if (resumeChoice === "new-session" && hasPendingTransaction) {
      const checkpoint = history.at(-1);
      previousResponseId = checkpoint?.response_id || "";
      lastUserMessage = checkpoint?.last_user_message || "";
      lastAssistantMessage = checkpoint?.last_assistant_message || "";
      sessionUsage = checkpoint?.usage ? { ...checkpoint.usage } : createUsageTotals();
      pendingToolCalls = [];
      pendingRetryRequest = null;
      pendingTransaction = null;
      failedResponse = false;
      await saveState();
      if (checkpoint) await persistCheckpoint(checkpointPath, checkpoint);
      writeTerminal(
        `${formatSystemMessage("Interrupted work abandoned; returned to the last successful checkpoint.")}\n`,
      );
    } else if (resumeChoice === "new-session") {
      resetState(createUsageTotals());
      await clearSession(statePath);
      writeTerminal(`${formatSystemMessage("Session cleared")}\n`);
    } else {
      const interruptedCallIds = new Set(
        (savedState?.pending_tool_calls || []).map((call) => getToolCallId(call)).filter(Boolean),
      );
      const uncertainCallIdentities = new Set(
        (savedState?.execution_journal || [])
          .filter((entry) => entry?.status === "started")
          .map((entry) => String(entry.identity || ""))
          .filter(Boolean),
      );
      const runPendingToolCall = createResumeToolCallRunner(
        resumeChoice === "auto-resume"
          ? "auto"
          : resumeChoice === "interrupt-retry"
            ? "retry"
            : "request",
        resumeChoice === "auto-resume" ? new Set() : interruptedCallIds,
        resumeChoice === "auto-resume" ? new Set() : uncertainCallIdentities,
      );
      writeTerminal(
        `${formatSystemMessage(resumeChoice === "auto-resume" ? "Resuming pending tool execution" : resumeChoice === "interrupt-retry" ? "Resuming pending tool execution with retry hint" : "Resuming pending tool execution with interruption notice")}\n`,
      );
      try {
        const resumedResponse = await handleToolCalls(
          openai,
          createPendingResponse(savedState),
          template,
          cwd,
          (usage, { skipIncrement = false } = {}) => {
            if (!skipIncrement) {
              addUsageTotals(sessionUsage, usage);
              sessionUsage.turns += 1;
            }
            return sessionUsage;
          },
          runPendingToolCall,
          {
            liveStreaming: true,
            sessionStartedAt: Date.now(),
            skipInitialUsageAccounting: true,
            onResponseState: persistResponseSnapshot,
            onToolExecutionState: persistToolExecutionState,
            confirmToolCall,
            suppressStatusOutput: debugEnabled || outputFlags.quiet,
            suppressUsageOutput: outputFlags.noUsage,
            noTimers: outputFlags.noTimers,
            colors: !outputFlags.noColors,
            noReasoning: outputFlags.noReasoning,
            noShellCalls: outputFlags.noShellCalls,
            noToolCalls: outputFlags.noToolCalls,
            noMcpOutput: outputFlags.noMcpOutput,
            noWebsearch: outputFlags.noWebsearch,
            debug: debugEnabled,
            transitionOnlyStatus: oneShot || !terminalInput?.isTTY,
            runToolCall: runPendingToolCall,
            onImageGeneration: handleImageGeneration,
            onViewImage: async ({
              args,
              response: current,
              previousResponseId,
              baseRequest,
              cwd: imageCwd,
            }) =>
              inspectImage(openai, args, {
                cwd: imageCwd,
                responseId: current?.id,
                previousResponseId,
                callerResponse: current,
                model: baseRequest?.model,
                processWorker: true,
                onUsage: (usage) => {
                  addUsageTotals(sessionUsage, usage);
                  sessionUsage.turns += usage.turns || 1;
                },
              }),
            yolo: yoloEnabled,
            onWorkerUsage: (usage) => {
              addUsageTotals(sessionUsage, usage);
              sessionUsage.turns += usage.turns || 0;
            },
            onWorkerComplete,
          },
        );
        previousResponseId = resumedResponse?.id || previousResponseId;
        lastAssistantMessage = extractTextFromResponse(resumedResponse);
        pendingToolCalls = [];
        await saveState();
      } catch (error) {
        if (error?.code === "previous_response_not_found") {
          writeTerminal(`${formatSystemMessage("Pending response not found; clearing session")}\n`);
          resetState(createUsageTotals());
          await clearSession(statePath);
        } else {
          failedResponse = true;
          if (!pendingTransaction?.request) pendingToolCalls = [];
          await saveState();
          writeTerminal(
            `${formatSystemMessage(`Pending response failed: ${error?.message || String(error)}. Session preserved.`)}\n`,
          );
        }
      }
    }
  }

  const runInteractiveToolCall = createInteractiveToolCallRunner({
    oneShot,
    terminalInput,
    preserveHistory: preserveReplHistory,
    closeReadline: () => rl?.close?.(),
    replaceReadline: replaceReplInterface,
  });

  function attachGoalInterrupt() {
    if (oneShot || !activeGoal || !terminalInput?.on) return () => {};
    let interrupted = false;
    const onInput = (chunk) => {
      if (!String(chunk).includes("\x14")) return;
      interrupted = true;
      activeGoal = { ...activeGoal, status: "cancelled", cancelled_at: new Date().toISOString() };
      void saveState().catch(() => {});
    };
    terminalInput.setRawMode?.(true);
    terminalInput.on("data", onInput);
    return () => {
      terminalInput.removeListener?.("data", onInput);
      terminalInput.setRawMode?.(false);
      return interrupted;
    };
  }

  const prepareReplInput = () => {
    if (oneShot || !terminalInput?.isTTY) return;
    terminalInput.setRawMode?.(true);
    terminalInput.resume?.();
  };

  let pendingInitialMessage = oneShot ? String(initialMessage ?? "") : null;
  try {
    for (;;) {
      let line;
      try {
        if (pendingInitialMessage === null) prepareReplInput();
        line =
          pendingInitialMessage !== null
            ? pendingInitialMessage
            : await rl.question(formatPromptForCwd(cwd));
        pendingInitialMessage = null;
      } catch (error) {
        if (error?.name === "AbortError" || error?.code === "ABORT_ERR") {
          if (activeGoal?.status === "active") {
            activeGoal = {
              ...activeGoal,
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
            };
            await saveState();
            writeTerminal(`${formatSystemMessage("Goal cancelled")}\n`);
            continue;
          }
          await exitWithSummary({ leadingNewline: true });
          return;
        }
        throw error;
      }

      let message = line.trim();
      if (!message) continue;

      if (message.startsWith("!")) {
        const command = message.slice(1).trim();
        if (!command) continue;
        const result = await executeLocalShellCommand({
          command,
          cwd,
          input: oneShot ? null : terminalInput,
          readline: rl,
          preserveHistory: preserveReplHistory,
          replaceReadline: replaceReplInterface,
          reportInterruption: () =>
            writeTerminal(`${formatSystemMessage("User interrupted command (Ctrl-C)")}\n`),
        });
        pendingCliTranscript = appendCliTranscript(pendingCliTranscript, command, result);
        await saveState();
        continue;
      }

      const internal = parseInternalCommand(message);
      if (internal?.type === "setup") {
        // Do not keep two readline interfaces attached to the same terminal.
        // The setup menu creates its own interface and raw-mode input handler;
        // leaving the REPL interface open here can strand its pending question
        // when setup exits, producing an unsettled top-level await warning.
        preserveReplHistory();
        rl?.close?.();
        try {
          await runSetup({ stdin: terminalInput, stdout: terminalOutput });
        } catch (error) {
          const errMsg = error?.message || String(error);
          printAgentText(`Error during setup: ${errMsg}`);
          // Return to REPL without crashing
        }
        template = applySettings(
          await loadPromptTemplate(promptPath, undefined, process.env, {
            loadMcp: !outputFlags.noMcp,
          }),
          await reloadSettings(),
        );
        writeTerminal(`${formatSystemMessage("Settings reloaded")}\n`);
        rl = createReplInterface(() => cwd, terminalInput, terminalOutput, replHistory);
        continue;
      }
      const goalCommand = transitionGoalCommand(activeGoal, internal);
      if (goalCommand.handled) {
        activeGoal = goalCommand.goal;
        if (goalCommand.persist) await saveState();
        if (goalCommand.message) writeTerminal(`${formatSystemMessage(goalCommand.message)}\n`);
        if (goalCommand.inputMessage) message = goalCommand.inputMessage;
        if (goalCommand.continue) continue;
      }

      if (internal?.type === "exit") {
        await exitWithSummary();
        return;
      }

      // `clear` command is handled by shell commands; no action needed here.

      if (internal?.type === "session_clear") {
        if (!outputFlags.noUsage) printUsageReport(sessionUsage, { model: template.model });
        resetState(createUsageTotals());
        await clearSession(statePath);
        writeTerminal(`${formatSystemMessage("Session cleared")}\n`);
        continue;
      }

      if (internal?.type === "rollback") {
        // The pending readline prompt must not remain attached while the raw-mode menu runs.
        // Otherwise readline can redraw/echo the next line after the menu exits.
        preserveReplHistory();
        rl?.close?.();
        try {
          const selected = await promptRollbackMenu(history, {
            input: terminalInput,
            output: terminalOutput,
          });
          if (selected) {
            applyRollback(selected);
            await saveState();
            await persistCheckpoint(checkpointPath, selected);
            writeTerminal(`${formatSystemMessage(`Rolled back to ${selected.response_id}`)}\n`);
          } else if (!history.length) {
            writeTerminal(
              `${formatSystemMessage("No successful rollback checkpoints available.")}\n`,
            );
          }
        } catch (error) {
          if (error?.name !== "AbortError")
            writeTerminal(`${formatSystemMessage(error?.message || String(error))}\n`);
        }
        rl = createReplInterface(() => cwd, terminalInput, terminalOutput, replHistory);
        continue;
      }

      if (internal?.type === "usage") {
        if (!outputFlags.noUsage) printUsageReport(sessionUsage, { model: template.model });
        continue;
      }

      if (internal?.type === "cd") {
        try {
          const oldCwd = cwd;
          cwd = await resolveCdTarget(internal.target, cwd, { previousCwd });
          previousCwd = oldCwd;
          cwdNote = buildWorkingDirectoryNote(cwd);
          writeTerminal(`${formatSystemMessage(`Directory changed to ${cwd}`)}\n`);
        } catch (error) {
          writeTerminal(`${formatSystemMessage(error?.message || String(error))}\n`);
        }
        continue;
      }

      const requestMessage = buildRequestMessage({ pendingCliTranscript, cwdNote, message });
      const sessionStartedAt = Date.now();
      cwdNote = "";
      lastUserMessage = message;
      let response;
      let retryRequest = null;
      pendingRetryRequest = null;
      await saveState();
      let recoveryAttempts = 0;
      let websocketRecoveryAttempts = 0;
      let websocketRecoveryStartedAt = null;
      while (!response) {
        const workerRoleMessage =
          oneShot && process.env.AGENTX_WORKER_ID ? WORKER_ROLE_MESSAGE : "";
        const requestTemplate = withGoalTools(template, activeGoal?.status === "active");
        const activeOverride = buildRequestOverride(
          requestTemplate,
          requestMessage,
          agentsText,
          cwd,
          previousResponseId,
          workerRoleMessage,
        );
        const goalRequestActive = activeGoal?.status === "active";
        const detachGoalInterrupt = attachGoalInterrupt();
        try {
          const onResponseUsage = (usage, { skipIncrement = false } = {}) => {
            if (!skipIncrement) {
              addUsageTotals(sessionUsage, usage);
              sessionUsage.turns += 1;
            }
            return sessionUsage;
          };
          const onRetryState = async ({ request, response: retryResponse }) => {
            pendingRetryRequest = request;
            pendingTransaction = {
              ...pendingTransaction,
              base_response_id: retryResponse?.id || pendingTransaction?.base_response_id || "",
              request,
              calls: pendingToolCalls,
              outputs: request?.input || [],
              execution_journal: executionJournal,
              attempt_count: Number(pendingTransaction?.attempt_count || 0) + 1,
            };
            await saveState();
          };
          const onViewImage = async ({
            args,
            response: current,
            previousResponseId,
            baseRequest,
            cwd: imageCwd,
          }) =>
            inspectImage(openai, args, {
              cwd: imageCwd,
              responseId: current?.id,
              previousResponseId,
              callerResponse: current,
              model: baseRequest?.model,
              processWorker: true,
              onUsage: (usage) => {
                addUsageTotals(sessionUsage, usage);
                sessionUsage.turns += usage.turns || 1;
              },
            });
          const onWorkerUsage = (usage) => {
            addUsageTotals(sessionUsage, usage);
            sessionUsage.turns += usage.turns || 0;
          };
          const goalCallbacks = createGoalCallbacks({
            getGoal: () => activeGoal,
            setGoal: (goal) => {
              activeGoal = goal;
            },
            saveState,
            getReadline: () => rl,
            terminalInput,
            printFinalResponse: printAgentText,
          });
          response = await sendMessage(
            openai,
            requestTemplate,
            previousResponseId,
            requestMessage,
            agentsText,
            cwd,
            onResponseUsage,
            retryRequest || activeOverride,
            {
              liveStreaming: true,
              sessionStartedAt,
              onResponseState: persistResponseSnapshot,
              onRetryState,
              onToolExecutionState: persistToolExecutionState,
              confirmToolCall,
              suppressStatusOutput: debugEnabled || outputFlags.quiet,
              suppressUsageOutput: outputFlags.noUsage,
              noTimers: outputFlags.noTimers,
              colors: !outputFlags.noColors,
              noReasoning: outputFlags.noReasoning,
              noShellCalls: outputFlags.noShellCalls,
              noToolCalls: outputFlags.noToolCalls,
              noMcpOutput: outputFlags.noMcpOutput,
              noWebsearch: outputFlags.noWebsearch,
              debug: debugEnabled,
              transitionOnlyStatus: oneShot || !terminalInput?.isTTY,
              runToolCall: runInteractiveToolCall,
              onImageGeneration: handleImageGeneration,
              onViewImage,
              yolo: yoloEnabled,
              onWorkerUsage,
              onWorkerComplete,
              goalMode: activeGoal?.status === "active",
              goalText: activeGoal?.text || message,
              goalIterations: activeGoal?.iterations || 0,
              onGoalIteration: goalCallbacks.onGoalIteration,
              isGoalCancelled: () => activeGoal?.status !== "active",
              onGoalComplete: goalCallbacks.onGoalComplete,
              onGoalFinalResponse: goalCallbacks.onGoalFinalResponse,
              onGoalBlocked: goalCallbacks.onGoalBlocked,
              onGoalLimit: goalCallbacks.onGoalLimit,
            },
          );
        } catch (error) {
          const websocketExpired = isWebsocketRecoveryError(error);
          let websocketRetryAvailable = false;
          if (websocketExpired) {
            websocketRecoveryStartedAt ??= Date.now();
            websocketRetryAvailable = await waitForWebsocketRetry(
              websocketRecoveryStartedAt,
              websocketRecoveryAttempts,
            );
          }
          const recovery = decideRequestFailure(error, {
            oneShot,
            recoveryAttempts,
            previousResponseId,
            websocketRetryAvailable,
          });
          recoveryAttempts = recovery.recoveryAttempts;
          if (recovery.action === "reconnect") {
            websocketRecoveryAttempts += 1;
            openai = await recreateOpenAIClient(openai, createSessionClient);
            activeOpenAI = openai;
            writeTerminal(
              `${formatSystemMessage("Responses connection expired; reconnecting.")}\n`,
            );
            continue;
          }
          if (recovery.action === "new-chain") {
            previousResponseId = "";
            retryRequest = null;
            pendingRetryRequest = null;
            writeTerminal(
              `${formatSystemMessage("Previous response not found; starting a new chain.")}\n`,
            );
            continue;
          }
          failedResponse = true;
          if (!pendingTransaction?.request) pendingToolCalls = [];
          await saveState();
          if (oneShot) {
            if (recovery.action === "retry-pending") {
              retryRequest = pendingRetryRequest;
              continue;
            }
            throw error;
          }
          let choice;
          try {
            choice = await promptRecoveryMenu(error, {
              input: terminalInput,
              output: terminalOutput,
            });
          } catch (menuError) {
            if (menuError?.name === "AbortError") {
              terminalInput.setRawMode?.(false);
              terminalInput.resume?.();
              preserveReplHistory();
              rl?.close?.();
              rl = createReplInterface(() => cwd, terminalInput, terminalOutput, replHistory);
              writeTerminal(`${formatSystemMessage("Recovery cancelled; session preserved.")}\n`);
              break;
            }
            throw menuError;
          }
          const menuRecovery = decideRecoveryMenuChoice(choice, recoveryAttempts);
          recoveryAttempts = menuRecovery.recoveryAttempts;
          if (menuRecovery.action === "retry" || menuRecovery.action === "debug-retry") {
            openai = await recreateOpenAIClient(openai, createSessionClient);
            activeOpenAI = openai;
            if (menuRecovery.action === "debug-retry" && !debugEnabled) {
              debugEnabled = true;
              bindAgentDebugListeners(openai);
              process.stderr.write("[agentx:debug] enabled for retry\n");
            }
            retryRequest = pendingRetryRequest;
            continue;
          }
          if (menuRecovery.action === "new-chain") {
            previousResponseId = "";
            retryRequest = null;
            pendingRetryRequest = null;
            continue;
          }
          if (menuRecovery.action === "rollback") {
            const selected = await promptRollbackMenu(history, {
              input: terminalInput,
              output: terminalOutput,
            });
            if (selected) {
              applyRollback(selected);
              await saveState();
              await persistCheckpoint(checkpointPath, selected);
            }
            break;
          }
          if (menuRecovery.action === "clear") {
            retryRequest = null;
            resetState(createUsageTotals());
            await clearSession(statePath);
            writeTerminal(`${formatSystemMessage("Session cleared")}\n`);
            break;
          }
          break;
        } finally {
          detachGoalInterrupt();
          if (goalRequestActive) replaceReplInterface();
        }
      }
      if (!response) continue;
      previousResponseId = response?.id || previousResponseId;
      lastAssistantMessage = extractTextFromResponse(response);
      pendingToolCalls = [];
      pendingRetryRequest = null;
      retryRequest = null;
      pendingCliTranscript = "";
      failedResponse = false;
      rollbackBackup = [];
      if (response?.id) {
        history = [
          ...history,
          {
            response_id: response.id,
            timestamp: new Date().toISOString(),
            user_preview: message.slice(0, 20),
            assistant_preview: lastAssistantMessage.slice(0, 20),
            usage: { ...sessionUsage },
            last_user_message: lastUserMessage,
            last_assistant_message: lastAssistantMessage,
          },
        ].slice(-20);
      }
      await saveState();
      if (!oneShot)
        await persistCheckpoint(checkpointPath, {
          response_id: response.id,
          usage: sessionUsage,
          last_user_message: lastUserMessage,
          last_assistant_message: lastAssistantMessage,
          history,
        });
      if (oneShot) {
        await clearSession(statePath);
        await exitWithSummary();
        return;
      }
    }
  } finally {
    rl?.close?.();
    try {
      await openai?.responses?.close?.();
    } catch {
      /* shutdown is best effort */
    }
    activeOpenAI = null;
    await terminateWorkers();
    signalRegistration.removeHandlers?.();
    setTerminalOutputOptions({ colors: true });
  }
}
