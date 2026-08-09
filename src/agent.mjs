import { createInterface } from 'node:readline/promises';
import { readdir, stat, unlink } from 'node:fs/promises';
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';
import { log, registerHandlers, registerSignals, path } from '@eliware/common';
import { createOpenAI } from '@eliware/openai';
import { shellExec } from './tool-shell.mjs';
import { completePath } from './completion.mjs';
import { clearSession, persistResponseState, readSessionState } from './session-state.mjs';
import { extractTextFromResponse } from './response.mjs';
import { handleToolCalls } from './agent-session/tool-loop.mjs';
import { sendMessage } from './agent-session/session-service.mjs';
import { buildWorkingDirectoryNote, clearTerminal, formatPromptForCwd, formatSystemMessage, parseInternalCommand, readAgentsFromCwdAndParents, resolveCdTarget } from './shell.mjs';
import { formatFinalUsageMessage } from './shell-display.mjs';
import { createUsageTotals, addUsageTotals, formatUsageReport } from './response.mjs';
import { getTerminalWidth, wrapText } from './text-wrap.mjs';
import { appendCliTranscript, buildRequestMessage, buildRequestOverride, loadPromptTemplate, withGoalTools, resolveAgentApiKey, WORKER_ROLE_MESSAGE } from './agent-flow.mjs';
import { promptResumeMenu } from './resume-menu.mjs';
import { promptRollbackMenu } from './rollback-menu.mjs';
import { promptRecoveryMenu } from './recovery-menu.mjs';
import { applySettings, formatStartupSettings, reloadSettings, settingsFromEnv } from './settings.mjs';
import { runSetup } from './setup.mjs';
import { confirmationKey, confirmationFilePath, loadGlobalConfirmations, saveGlobalConfirmations } from './confirmation-policy.mjs';
import { terminateWorkers } from './parallel-workers.mjs';
import { inspectImage } from './image-inspector.mjs';
import { saveGeneratedImage } from './image-generation.mjs';
import { recreateOpenAIClient } from './retry-recovery.mjs';

registerHandlers({ log });
let activeOpenAI = null;
const signalRegistration = registerSignals({ log, shutdownHook: async () => {
  try { await activeOpenAI?.responses?.close?.(); } catch { /* shutdown is best effort */ }
  await terminateWorkers();
} });

async function cleanupStaleOneShotStates(directory, now = Date.now()) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith('.agentx_responseid.oneshot-')) continue;
    const filePath = path(directory, entry.name);
    if (now - (await stat(filePath)).mtimeMs >= 60 * 60 * 1000) await unlink(filePath).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
  }
}

function printAgentText(text) {
  const wrapped = wrapText(text, getTerminalWidth());
  process.stdout.write(wrapped.endsWith('\n') ? wrapped : `${wrapped}\n`);
}

function printResumeMessage(label, text) {
  if (!text) return;
  process.stdout.write(`${formatSystemMessage(`${label}:`)}\n`);
  printAgentText(text);
}

function createReplInterface(getCwd, input = defaultInput, output = defaultOutput, history = []) {
  const rl = createInterface({ input, output, completer: (line) => completePath(line, getCwd()) });
  if (Array.isArray(history)) rl.history = [...history];
  return rl;
}

function printUsageReport(totals, { leadingNewline = false, model } = {}) {
  process.stdout.write(`${leadingNewline ? '\n' : ''}${formatFinalUsageMessage(formatUsageReport({ ...totals, model }))}\n`);
}

function createPendingResponse(savedState) {
  return {
    id: String(savedState?.response_id ?? ''),
    output: Array.isArray(savedState?.pending_tool_calls) ? savedState.pending_tool_calls : [],
  };
}

function getToolCallId(call) {
  return String(call?.call_id || call?.id || '').trim();
}

async function readLatestCheckpoint(checkpointPath, fallbackStatePath) {
  const checkpoint = await readSessionState(checkpointPath);
  if (checkpoint?.response_id) return checkpoint;
  const state = await readSessionState(fallbackStatePath);
  const entry = state?.history?.at(-1);
  return entry?.response_id ? { ...entry, pending_cli_transcript: '', pending_tool_calls: [], history: [entry] } : null;
}

async function persistCheckpoint(checkpointPath, state) {
  await persistResponseState(checkpointPath, {
    response_id: state?.response_id,
    usage: state?.usage,
    last_user_message: state?.last_user_message,
    last_assistant_message: state?.last_assistant_message,
    pending_cli_transcript: '',
    pending_tool_calls: [],
    history: state?.history,
  });
}

const INTERRUPTED_TOOL_OUTPUT_RETRY = `The previous transaction was interrupted while tool calls were in progress.

The interrupted command may have completed successfully, failed, or only partially applied changes.

Think carefully about the likely state before acting.
- If the command is trivial and safe to repeat, you may run it again.
- Otherwise, inspect the relevant system state first, determine whether the prior action succeeded or partially succeeded, and choose the safest next step.`;

const INTERRUPTED_TOOL_OUTPUT_REQUEST = `The previous transaction was interrupted while tool calls were in progress.

Stop all further tool calls.
Do not retry the interrupted command.
Ask the user what they want to do next.`;

function buildInterruptedToolOutput(call, mode) {
  const message = mode === 'retry'
    ? INTERRUPTED_TOOL_OUTPUT_RETRY
    : INTERRUPTED_TOOL_OUTPUT_REQUEST;

  if (call?.type === 'shell_call') {
    return {
      type: 'shell_call_output',
      call_id: getToolCallId(call),
      status: 'completed',
      output: [{ stdout: message, stderr: '', outcome: { type: 'exit', exit_code: 0 } }],
    };
  }

  return message;
}

function createResumeToolCallRunner(mode, pendingCallIds = new Set(), uncertainCallIdentities = new Set()) {
  return async (call, cwd) => {
    const identity = `id:${getToolCallId(call)}`;
    if (pendingCallIds.has(getToolCallId(call)) || uncertainCallIdentities.has(identity)) {
      return buildInterruptedToolOutput(call, mode === 'auto' ? 'request' : mode);
    }
    const { runToolCall } = await import('./tool-dispatch.mjs');
    return await runToolCall(call, cwd);
  };
}

export async function runAgent({ promptPath, cwd, input: terminalInput = defaultInput, output: terminalOutput = defaultOutput, initialMessage = null, oneShot = false } = {}) {
  const launchCwd = cwd;
  const sessionStatePath = path(launchCwd, '.agentx_responseid');
  await cleanupStaleOneShotStates(launchCwd);
  const checkpointPath = path(launchCwd, '.agentx_checkpoint');
  const statePath = oneShot ? `${sessionStatePath}.oneshot-${process.pid}-${Date.now()}` : sessionStatePath;
  let template = applySettings(await loadPromptTemplate(promptPath), settingsFromEnv());
  const agentsText = await readAgentsFromCwdAndParents(cwd).catch((error) => {
    throw new Error(`Unable to read AGENTS.md files under ${cwd}: ${error?.message || String(error)}`);
  });
  const savedState = oneShot
    ? ((await readLatestCheckpoint(checkpointPath, sessionStatePath)) || null)
    : await readSessionState(statePath);
  const savedResponseId = savedState?.response_id || '';
  const apiKey = process.env.agentx_api_key || process.env.AGENTX_API_KEY || (process.env.JEST_WORKER_ID ? 'test-key' : resolveAgentApiKey());
  let debugEnabled = process.argv.includes('--debug');
  const yoloEnabled = !process.argv.includes('--confirm');
  const attachOpenAIListeners = (client) => {
    if (typeof client?.responses?.on !== 'function') return;
    // Always bind error: the SDK otherwise reports transport errors as unhandled rejections.
    client.responses.on('error', (detail) => {
      if (debugEnabled) process.stderr.write(`[openai:error] ${JSON.stringify(detail ?? {})}\n`);
    });
    if (debugEnabled) bindOpenAIDebugListeners(client);
  };
  const bindOpenAIDebugListeners = (client) => {
    if (typeof client?.responses?.on !== 'function') return;
    for (const event of ['connecting', 'open', 'reconnecting', 'reconnected', 'close']) {
      client.responses.on(event, (detail) => process.stderr.write(`[openai:${event}] ${JSON.stringify(detail ?? {})}\n`));
    }
  };
  const createSessionClient = () => {
    const client = createOpenAI({ apiKey, transport: 'websocket' });
    attachOpenAIListeners(client);
    return client;
  };
  let openai = createSessionClient();
  activeOpenAI = openai;

  process.stdout.write(`${formatStartupSettings(settingsFromEnv())}\n`);
  if (!agentsText) process.stdout.write(`${formatSystemMessage('AGENTS.md not found; ask AgentX to generate one for this project.')}\n`);
  process.stdout.write(`${formatSystemMessage(savedResponseId ? `${oneShot ? 'Branching from checkpoint' : 'Resuming conversation'} ${savedResponseId}` : 'Starting new session')}\n`);
  if (!oneShot) {
    printResumeMessage('Last user message', savedState?.last_user_message || '');
    printResumeMessage('Last assistant message', savedState?.last_assistant_message || '');
  }
  const hasPendingTransaction = Boolean(savedState?.failed_response && savedState?.pending_retry_request);
  if (savedState?.failed_response) {
    process.stdout.write(`${formatSystemMessage(hasPendingTransaction ? 'Previous continuation failed; pending tool transaction preserved for recovery.' : 'Previous request failed; starting from the last successful checkpoint.')}\n`);
  }
  let previousResponseId = savedState?.failed_response && !hasPendingTransaction ? (savedState?.history?.at(-1)?.response_id || '') : savedResponseId;
  let cwdNote = '';
  let previousCwd = null;
  let lastUserMessage = savedState?.last_user_message || '';
  let lastAssistantMessage = savedState?.last_assistant_message || '';
  let pendingCliTranscript = savedState?.pending_cli_transcript || '';
  let sessionUsage = savedState?.usage
    ? { inputTokens: Number(savedState.usage.inputTokens ?? 0), cachedTokens: Number(savedState.usage.cachedTokens ?? 0), outputTokens: Number(savedState.usage.outputTokens ?? 0), turns: Number(savedState.usage.turns ?? 0) }
    : createUsageTotals();
  let pendingToolCalls = Array.isArray(savedState?.pending_tool_calls) ? savedState.pending_tool_calls : [];
  let executionJournal = Array.isArray(savedState?.execution_journal) ? savedState.execution_journal : [];
  let history = Array.isArray(savedState?.history) ? savedState.history : [];
  let rollbackBackup = Array.isArray(savedState?.rollback_backup) ? savedState.rollback_backup : [];
  let failedResponse = Boolean(savedState?.failed_response);
  let pendingRetryRequest = savedState?.pending_retry_request || null;
  let pendingTransaction = savedState?.pending_transaction || null;
  let activeGoal = savedState?.goal || null;
  // Goals never resume implicitly after process restart.
  if (activeGoal?.status === 'active') activeGoal = null;
  const globalConfirmationPath = confirmationFilePath();
  const globalConfirmations = await loadGlobalConfirmations(globalConfirmationPath);
  const sessionConfirmations = new Set();
  // Resume may execute confirmation-gated tools before entering the prompt loop.
  // Initialize readline first so confirmToolCall never hits the TDZ.
  let replHistory = [];
  let rl = oneShot ? null : createReplInterface(() => cwd, terminalInput, terminalOutput, replHistory);
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
      pendingCliTranscript = appendCliTranscript(pendingCliTranscript, 'generated image', filePath);
      process.stdout.write(`${formatSystemMessage(`Generated image saved: ${filePath}`)}\n`);
      await saveState();
      return `Generated image saved to ${filePath}`;
    } catch (error) {
      const message = `Unable to save generated image: ${error?.message || String(error)}`;
      process.stdout.write(`${formatSystemMessage(message)}\n`);
      return message;
    }
  }

  async function saveState() {
    await persistResponseState(statePath, {
      response_id: previousResponseId,
      usage: sessionUsage,
      last_user_message: lastUserMessage,
      last_assistant_message: lastAssistantMessage,
      pending_cli_transcript: pendingCliTranscript,
      pending_tool_calls: pendingToolCalls,
      execution_journal: executionJournal,
      history,
      rollback_backup: rollbackBackup,
      failed_response: failedResponse,
      pending_retry_request: pendingRetryRequest,
      pending_transaction: pendingTransaction,
      goal: activeGoal,
    });
  }

  async function persistResponseSnapshot(snapshot) {
    const response = snapshot?.response;
    const nextCalls = Array.isArray(snapshot?.pendingToolCalls) ? snapshot.pendingToolCalls : [];
    previousResponseId = response?.id || previousResponseId;
    pendingToolCalls = nextCalls;
    if (response?.id && nextCalls.length > 0) {
      pendingTransaction = {
        base_response_id: response.id,
        calls: nextCalls,
        request: null,
        execution_journal: executionJournal,
      };
    }
    if (response?.id && nextCalls.length === 0) {
      failedResponse = false;
      pendingRetryRequest = null;
      pendingTransaction = null;
      lastAssistantMessage = extractTextFromResponse(response);
      history = [...history.filter((entry) => entry.response_id !== response.id), {
        response_id: response.id,
        timestamp: new Date().toISOString(),
        user_preview: lastUserMessage.slice(0, 20),
        assistant_preview: lastAssistantMessage.slice(0, 20),
        usage: { ...sessionUsage },
        last_user_message: lastUserMessage,
        last_assistant_message: lastAssistantMessage,
      }].slice(-20);
    }
    await saveState();
    if (response?.id && nextCalls.length === 0 && !oneShot) {
      await persistCheckpoint(checkpointPath, { response_id: response.id, usage: sessionUsage, last_user_message: lastUserMessage, last_assistant_message: lastAssistantMessage, history });
    }
  }
  if (savedState?.goal?.status === 'active') await saveState();

  async function confirmToolCall(call, toolCwd) {
    const key = confirmationKey(call, toolCwd);
    if (sessionConfirmations.has(key) || globalConfirmations.has(key)) return true;
    if (oneShot || !terminalInput?.isTTY) return false;
    const summary = String(call?.action?.commands ?? '').replace(/\s+/g, ' ').trim();
    const answer = await rl.question(`Allow state-changing command: ${summary} [y]es/[n]o/[s]ession/[g]lobal: `);
    const choice = answer.trim().toLowerCase();
    if (choice === 's' || choice === 'session') { sessionConfirmations.add(key); return true; }
    if (choice === 'g' || choice === 'global') { globalConfirmations.add(key); await saveGlobalConfirmations(globalConfirmations, globalConfirmationPath); return true; }
    return choice === 'y' || choice === 'yes';
  }

  async function persistToolExecutionState({ call, response, status, identity: suppliedIdentity }) {
    const identity = suppliedIdentity || `id:${String(call?.call_id || call?.id || '')}`;
    const record = { identity, status, response_id: String(response?.id || ''), updated_at: new Date().toISOString() };
    executionJournal = [...executionJournal.filter((entry) => entry.identity !== identity), record].slice(-100);
    await saveState();
  }

  async function exitWithSummary({ leadingNewline = false } = {}) {
    printUsageReport(sessionUsage, { leadingNewline, model: template.model });
    rl?.close?.();
    process.exit(0);
  }

  const hasPendingToolCalls = Boolean(previousResponseId && pendingToolCalls.length > 0);
  if (hasPendingToolCalls && !oneShot) {
    const resumeChoice = await promptResumeMenu(savedState, { input: terminalInput, output: terminalOutput });

    if (resumeChoice === 'new-session' && hasPendingTransaction) {
      const checkpoint = history.at(-1);
      previousResponseId = checkpoint?.response_id || '';
      lastUserMessage = checkpoint?.last_user_message || '';
      lastAssistantMessage = checkpoint?.last_assistant_message || '';
      sessionUsage = checkpoint?.usage ? { ...checkpoint.usage } : createUsageTotals();
      pendingToolCalls = [];
      pendingRetryRequest = null;
      failedResponse = false;
      await saveState();
      if (checkpoint) await persistCheckpoint(checkpointPath, checkpoint);
      process.stdout.write(`${formatSystemMessage('Interrupted work abandoned; returned to the last successful checkpoint.')}\n`);
    } else if (resumeChoice === 'new-session') {
      previousResponseId = '';
      lastUserMessage = '';
      lastAssistantMessage = '';
      pendingCliTranscript = '';
      pendingToolCalls = [];
      history = [];
      rollbackBackup = [];
      failedResponse = false;
      sessionUsage = createUsageTotals();
      await clearSession(statePath);
      process.stdout.write(`${formatSystemMessage('Session cleared')}\n`);
    } else {
      const interruptedCallIds = new Set((savedState?.pending_tool_calls || []).map((call) => getToolCallId(call)).filter(Boolean));
      const uncertainCallIdentities = new Set((savedState?.execution_journal || [])
        .filter((entry) => entry?.status === 'started')
        .map((entry) => String(entry.identity || ''))
        .filter(Boolean));
      const runPendingToolCall = createResumeToolCallRunner(
        resumeChoice === 'auto-resume' ? 'auto' : resumeChoice === 'interrupt-retry' ? 'retry' : 'request',
        resumeChoice === 'auto-resume' ? new Set() : interruptedCallIds,
        uncertainCallIdentities,
      );
      process.stdout.write(`${formatSystemMessage(resumeChoice === 'auto-resume' ? 'Resuming pending tool execution' : resumeChoice === 'interrupt-retry' ? 'Resuming pending tool execution with retry hint' : 'Resuming pending tool execution with interruption notice')}\n`);
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
            suppressStatusOutput: debugEnabled,
            debug: debugEnabled,
            transitionOnlyStatus: oneShot || !terminalInput?.isTTY,
            runToolCall: runInteractiveToolCall,
            onImageGeneration: handleImageGeneration,
            onViewImage: async ({ args, response: current, previousResponseId, baseRequest, cwd: imageCwd }) => inspectImage(openai, args, { cwd: imageCwd, responseId: current?.id, previousResponseId, callerResponse: current, model: baseRequest?.model, processWorker: true, onUsage: (usage) => { addUsageTotals(sessionUsage, usage); sessionUsage.turns += usage.turns || 0; } }),
            yolo: yoloEnabled,
            onWorkerUsage: (usage) => { addUsageTotals(sessionUsage, usage); sessionUsage.turns += usage.turns || 0; },
          },
        );
        previousResponseId = resumedResponse?.id || previousResponseId;
        lastAssistantMessage = extractTextFromResponse(resumedResponse);
        pendingToolCalls = [];
        await saveState();
      } catch (error) {
        if (error?.code === 'previous_response_not_found') {
          process.stdout.write(`${formatSystemMessage('Pending response not found; clearing session')}\n`);
          previousResponseId = '';
          lastUserMessage = '';
          lastAssistantMessage = '';
          pendingCliTranscript = '';
          pendingToolCalls = [];
          sessionUsage = createUsageTotals();
          await clearSession(statePath);
        } else {
          failedResponse = true;
          if (!pendingTransaction?.request) pendingToolCalls = [];
          await saveState();
          process.stdout.write(`${formatSystemMessage(`Pending response failed: ${error?.message || String(error)}. Session preserved.`)}\n`);
        }
      }
    }
  }

  async function runInteractiveToolCall(call, toolCwd, options = {}) {
    const controller = new AbortController();
    const interactive = !oneShot && terminalInput?.isTTY && typeof terminalInput?.setRawMode === 'function' && typeof terminalInput?.on === 'function';
    let interrupted = false;
    const onRawData = (chunk) => {
      if (String(chunk).includes('\x14')) {
        interrupted = true;
        options?.statusController?.pause?.();
        process.stdout.write(`${formatSystemMessage('User interrupted command (Ctrl-T)')}\n`);
        controller.abort();
      }
    };
    if (interactive) {
      preserveReplHistory();
      rl?.close?.();
      terminalInput.setRawMode(true);
      terminalInput.on('data', onRawData);
      terminalInput.resume?.();
    }
    try {
      const { runToolCall } = await import('./tool-dispatch.mjs');
      const output = await runToolCall(call, toolCwd, { ...options, signal: controller.signal });
      if (interrupted && output?.type === 'shell_call_output') {
        const first = output.output?.[0];
        if (first) first.stderr = `${first.stderr || ''}${first.stderr ? '\n' : ''}The user requested interruption (Ctrl-T). Stop executing and do not retry or run additional commands. Return the current status to the user.`;
      }
      return output;
    } finally {
      if (interactive) {
        terminalInput.removeListener?.('data', onRawData);
        terminalInput.setRawMode(false);
        replaceReplInterface();
      }
    }
  }

  function attachGoalInterrupt() {
    if (oneShot || !activeGoal || !terminalInput?.on) return () => {};
    let interrupted = false;
    const onInput = (chunk) => { if (String(chunk).includes('\x14')) { interrupted = true; activeGoal = { ...activeGoal, status: 'cancelled', cancelled_at: new Date().toISOString() }; } };
    terminalInput.setRawMode?.(true);
    terminalInput.on('data', onInput);
    return () => { terminalInput.removeListener?.('data', onInput); terminalInput.setRawMode?.(false); return interrupted; };
  }

  const prepareReplInput = () => {
    if (oneShot || !terminalInput?.isTTY) return;
    terminalInput.setRawMode?.(true);
    terminalInput.resume?.();
  };

  let pendingInitialMessage = oneShot ? String(initialMessage ?? '') : null;
  try {
    for (; ;) {
      let line;
      try {
        if (pendingInitialMessage === null) prepareReplInput();
        line = pendingInitialMessage !== null ? pendingInitialMessage : await rl.question(formatPromptForCwd(cwd));
        pendingInitialMessage = null;
      } catch (error) {
        if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
          if (activeGoal?.status === 'active') { activeGoal = { ...activeGoal, status: 'cancelled', cancelled_at: new Date().toISOString() }; await saveState(); process.stdout.write(`${formatSystemMessage('Goal cancelled')}\n`); continue; }
          await exitWithSummary({ leadingNewline: true });
          return;
        }
        throw error;
      }

      let message = line.trim();
      // Handle plain `clear` command to clear the terminal display.
      if (message === 'clear') {
        clearTerminal();
        continue;
      }
      if (!message) continue;

      if (message.startsWith('!')) {
        const command = message.slice(1).trim();
        if (!command) continue;
        const controller = new AbortController();
        const interactiveShell = !oneShot && terminalInput?.isTTY && typeof terminalInput?.setRawMode === 'function' && typeof terminalInput?.on === 'function';
        let interruptedShell = false;
        const onShellInput = (chunk) => {
          if (!String(chunk).includes('\x03')) return;
          interruptedShell = true;
          controller.abort();
        };
        if (interactiveShell) {
          preserveReplHistory();
          rl?.close?.();
          terminalInput.setRawMode(true);
          terminalInput.on('data', onShellInput);
          terminalInput.resume?.();
        }
        let result;
        try {
          result = await shellExec(command, cwd, { signal: controller.signal });
          if (interruptedShell) process.stdout.write(`${formatSystemMessage('User interrupted command (Ctrl-C)')}\n`);
        } finally {
          if (interactiveShell) {
            terminalInput.removeListener?.('data', onShellInput);
            terminalInput.setRawMode(false);
            replaceReplInterface();
          }
        }
        pendingCliTranscript = appendCliTranscript(pendingCliTranscript, command, result);
        await saveState();
        continue;
      }

      const internal = parseInternalCommand(message);
      if (internal?.type === 'setup') {
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
        template = applySettings(await loadPromptTemplate(promptPath), await reloadSettings());
        process.stdout.write(`${formatSystemMessage('Settings reloaded')}\n`);
        rl = createReplInterface(() => cwd, terminalInput, terminalOutput, replHistory);
        continue;
      }
      if (internal?.type === 'goal_help') {
        process.stdout.write(`${formatSystemMessage('Usage: /goal <text> | /goal status | /goal cancel')}\n`);
        continue;
      }
      if (internal?.type === 'goal_status') {
        process.stdout.write(`${formatSystemMessage(activeGoal?.status === 'active' ? `Active goal: ${activeGoal.text} (iteration ${activeGoal.iterations || 0})` : 'No active goal.')}\n`);
        continue;
      }
      if (internal?.type === 'goal_cancel') {
        if (activeGoal) { activeGoal = { ...activeGoal, status: 'cancelled' }; await saveState(); process.stdout.write(`${formatSystemMessage('Goal cancelled')}\n`); }
        else process.stdout.write(`${formatSystemMessage('No active goal.')}\n`);
        continue;
      }
      if (internal?.type === 'goal') {
        if (activeGoal?.status === 'active') { process.stdout.write(`${formatSystemMessage('A goal is already active; cancel it first.')}\n`); continue; }
        activeGoal = { text: internal.goal, status: 'active', iterations: 0, started_at: new Date().toISOString() };
        process.stdout.write(`${formatSystemMessage(`Goal started: ${internal.goal}`)}\n`);
        message = internal.goal;
      }

      if (internal?.type === 'exit') {
        await exitWithSummary();
        return;
      }

      // `clear` command is handled by shell commands; no action needed here.

      if (internal?.type === 'session_clear') {
        printUsageReport(sessionUsage, { model: template.model });
        previousResponseId = '';
        lastUserMessage = '';
        lastAssistantMessage = '';
        pendingCliTranscript = '';
        pendingToolCalls = [];
        activeGoal = null;
        sessionUsage = createUsageTotals();
        await clearSession(statePath);
        process.stdout.write(`${formatSystemMessage('Session cleared')}\n`);
        continue;
      }

      if (internal?.type === 'rollback') {
        // The pending readline prompt must not remain attached while the raw-mode menu runs.
        // Otherwise readline can redraw/echo the next line after the menu exits.
        preserveReplHistory();
        rl?.close?.();
        try {
          const selected = await promptRollbackMenu(history, { input: terminalInput, output: terminalOutput });
          if (selected) {
            previousResponseId = selected.response_id;
            lastUserMessage = selected.last_user_message;
            lastAssistantMessage = selected.last_assistant_message;
            sessionUsage = { ...selected.usage };
            pendingToolCalls = [];
            const selectedIndex = history.indexOf(selected);
            rollbackBackup = history.slice(selectedIndex + 1);
            history = history.slice(0, selectedIndex + 1);
            failedResponse = false;
            await saveState();
            await persistCheckpoint(checkpointPath, selected);
            process.stdout.write(`${formatSystemMessage(`Rolled back to ${selected.response_id}`)}\n`);
          } else if (!history.length) {
            process.stdout.write(`${formatSystemMessage('No successful rollback checkpoints available.') }\n`);
          }
        } catch (error) {
          if (error?.name !== 'AbortError') process.stdout.write(`${formatSystemMessage(error?.message || String(error))}\n`);
        }
        rl = createReplInterface(() => cwd, terminalInput, terminalOutput, replHistory);
        continue;
      }

      if (internal?.type === 'usage') {
        printUsageReport(sessionUsage, { model: template.model });
        continue;
      }

      if (internal?.type === 'cd') {
        try {
          const oldCwd = cwd;
          cwd = await resolveCdTarget(internal.target, cwd, { previousCwd });
          previousCwd = oldCwd;
          cwdNote = buildWorkingDirectoryNote(cwd);
          process.stdout.write(`${formatSystemMessage(`Directory changed to ${cwd}`)}\n`);
        } catch (error) {
          process.stdout.write(`${formatSystemMessage(error?.message || String(error))}\n`);
        }
        continue;
      }

      const requestMessage = buildRequestMessage({ pendingCliTranscript, cwdNote, message });
      const sessionStartedAt = Date.now();
      cwdNote = '';
      lastUserMessage = message;
      let response;
      let retryRequest = null;
      pendingRetryRequest = null;
      await saveState();
      let recoveryAttempts = 0;
      let websocketRecoveryAttempts = 0;
      while (!response) {
        const workerRoleMessage = oneShot && process.env.AGENTX_WORKER_ID ? WORKER_ROLE_MESSAGE : '';
        const requestTemplate = withGoalTools(template, activeGoal?.status === 'active');
        const activeOverride = buildRequestOverride(requestTemplate, requestMessage, agentsText, cwd, previousResponseId, workerRoleMessage);
        const goalRequestActive = activeGoal?.status === 'active';
        const detachGoalInterrupt = attachGoalInterrupt();
        try {
          response = await sendMessage(openai, requestTemplate, previousResponseId, requestMessage, agentsText, cwd, (usage, { skipIncrement = false } = {}) => {
            if (!skipIncrement) {
              addUsageTotals(sessionUsage, usage);
              sessionUsage.turns += 1;
            }
            return sessionUsage;
          }, retryRequest || activeOverride, { liveStreaming: true, sessionStartedAt, onResponseState: persistResponseSnapshot, onRetryState: async ({ request, response }) => { pendingRetryRequest = request; pendingTransaction = { ...(pendingTransaction || {}), base_response_id: response?.id || pendingTransaction?.base_response_id || '', request, calls: pendingToolCalls, outputs: request?.input || [], execution_journal: executionJournal, attempt_count: Number(pendingTransaction?.attempt_count || 0) + 1 }; await saveState(); }, onToolExecutionState: persistToolExecutionState, confirmToolCall, suppressStatusOutput: debugEnabled, debug: debugEnabled, transitionOnlyStatus: oneShot || !terminalInput?.isTTY, runToolCall: runInteractiveToolCall, onImageGeneration: handleImageGeneration, onViewImage: async ({ args, response: current, previousResponseId, baseRequest, cwd: imageCwd }) => inspectImage(openai, args, { cwd: imageCwd, responseId: current?.id, previousResponseId, callerResponse: current, model: baseRequest?.model, processWorker: true, onUsage: (usage) => { addUsageTotals(sessionUsage, usage); sessionUsage.turns += usage.turns || 0; } }), yolo: yoloEnabled, onWorkerUsage: (usage) => { addUsageTotals(sessionUsage, usage); sessionUsage.turns += usage.turns || 0; }, goalMode: activeGoal?.status === 'active', goalText: activeGoal?.text || message, goalIterations: activeGoal?.iterations || 0, isGoalCancelled: () => activeGoal?.status !== 'active', onGoalComplete: async (result) => { activeGoal = { ...activeGoal, status: 'completed', result, completed_at: new Date().toISOString() }; await saveState(); process.stdout.write(`${formatSystemMessage('GOAL COMPLETE')}\n`); }, onGoalBlocked: async ({ question, choices = [] }) => { process.stdout.write(`${formatSystemMessage(`GOAL BLOCKED: ${question}`)}\n`); choices.forEach((choice, index) => process.stdout.write(`${String.fromCharCode(65 + index)}) ${choice}\n`)); const answer = await rl.question(choices.length ? 'Choose A-D or answer: ' : 'Answer: '); activeGoal = { ...activeGoal, iterations: (activeGoal?.iterations || 0) + 1, last_question: question }; await saveState(); return answer; }, onGoalLimit: async (iterations) => { activeGoal = { ...activeGoal, status: 'blocked', iterations }; await saveState(); process.stdout.write(`${formatSystemMessage(`Goal stopped after ${iterations} iterations`)}\n`); } });
        } catch (error) {
          const errorText = `${error?.message || ''} ${error?.cause?.message || ''}`;
          const websocketExpired = error?.code === 'websocket_connection_limit_reached' || errorText.includes('websocket_connection_limit_reached') || errorText.includes('cannot send on a closed WebSocket');
          if (websocketExpired && websocketRecoveryAttempts < 1) {
            websocketRecoveryAttempts += 1;
            openai = await recreateOpenAIClient(openai, createSessionClient);
            activeOpenAI = openai;
            process.stdout.write(`${formatSystemMessage('Responses connection expired; reconnecting.')}\n`);
            continue;
          }
          if (error?.code === 'previous_response_not_found' && previousResponseId && recoveryAttempts < 1) {
            recoveryAttempts += 1;
            previousResponseId = '';
            retryRequest = null;
            pendingRetryRequest = null;
            process.stdout.write(`${formatSystemMessage('Previous response not found; starting a new chain.')}\n`);
            continue;
          }
          failedResponse = true;
          if (!pendingTransaction?.request) pendingToolCalls = [];
          await saveState();
          if (oneShot) {
            if (recoveryAttempts < 1) { recoveryAttempts += 1; retryRequest = pendingRetryRequest; continue; }
            throw error;
          }
          let choice;
          try { choice = await promptRecoveryMenu(error, { input: terminalInput, output: terminalOutput }); }
          catch (menuError) { if (menuError?.name === 'AbortError') { process.stdout.write(`${formatSystemMessage('Recovery cancelled; session preserved.')}\n`); break; } throw menuError; }
          if (choice === 'retry' || choice === 'debug-retry') {
            openai = await recreateOpenAIClient(openai, createSessionClient);
            activeOpenAI = openai;
            if (choice === 'debug-retry' && !debugEnabled) { debugEnabled = true; bindOpenAIDebugListeners(openai); process.stderr.write('[agentx:debug] enabled for retry\n'); }
            recoveryAttempts += 1; retryRequest = pendingRetryRequest; continue;
          }
          if (choice === 'new-chain' && recoveryAttempts < 2) { recoveryAttempts += 1; previousResponseId = ''; retryRequest = null; pendingRetryRequest = null; continue; }
          if (choice === 'rollback') {
            const selected = await promptRollbackMenu(history, { input: terminalInput, output: terminalOutput });
            if (selected) {
              previousResponseId = selected.response_id; lastUserMessage = selected.last_user_message; lastAssistantMessage = selected.last_assistant_message;
              sessionUsage = { ...selected.usage }; const selectedIndex = history.indexOf(selected); rollbackBackup = history.slice(selectedIndex + 1); history = history.slice(0, selectedIndex + 1); failedResponse = false; await saveState();
            }
            break;
          }
          if (choice === 'clear') {
            previousResponseId = ''; retryRequest = null; pendingRetryRequest = null; lastUserMessage = ''; lastAssistantMessage = ''; pendingCliTranscript = ''; pendingToolCalls = []; history = []; rollbackBackup = []; failedResponse = false; sessionUsage = createUsageTotals(); await clearSession(statePath);
            process.stdout.write(`${formatSystemMessage('Session cleared')}\n`);
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
      if (activeGoal?.status === 'active') activeGoal = { ...activeGoal, iterations: (activeGoal.iterations || 0) + 1 };
      lastAssistantMessage = extractTextFromResponse(response);
      pendingToolCalls = [];
      pendingRetryRequest = null;
      retryRequest = null;
      pendingCliTranscript = '';
      failedResponse = false;
      rollbackBackup = [];
      if (response?.id) {
        history = [...history, { response_id: response.id, timestamp: new Date().toISOString(), user_preview: message.slice(0, 20), assistant_preview: lastAssistantMessage.slice(0, 20), usage: { ...sessionUsage }, last_user_message: lastUserMessage, last_assistant_message: lastAssistantMessage }].slice(-20);
      }
      await saveState();
      if (!oneShot) await persistCheckpoint(checkpointPath, { response_id: response.id, usage: sessionUsage, last_user_message: lastUserMessage, last_assistant_message: lastAssistantMessage, history });
      if (oneShot) {
        await clearSession(statePath);
        await exitWithSummary();
        return;
      }
    }
  } finally {
    rl?.close?.();
    try { await openai?.responses?.close?.(); } catch { /* shutdown is best effort */ }
    activeOpenAI = null;
    await terminateWorkers();
    signalRegistration.removeHandlers?.();
  }
}
