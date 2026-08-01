import { createInterface } from 'node:readline/promises';
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';
import { log, registerHandlers, path } from '@eliware/common';
import { createOpenAIResponsesTransport } from './openai-transport.mjs';
import { shellExec } from './tool-shell.mjs';
import { completePath } from './completion.mjs';
import { clearSession, extractTextFromResponse, handleToolCalls, persistResponseState, readSessionState, sendMessage } from './agent-session.mjs';
import { buildWorkingDirectoryNote, clearTerminal, formatPromptForCwd, formatSystemMessage, parseInternalCommand, readAgentsFromCwdAndParents, resolveCdTarget } from './shell.mjs';
import { createUsageTotals, addUsageTotals, formatUsageReport } from './response.mjs';
import { getTerminalWidth, wrapText } from './text-wrap.mjs';
import { appendCliTranscript, buildRequestMessage, buildRequestOverride, loadPromptTemplate, resolveAgentApiKey } from './agent-flow.mjs';
import { promptResumeMenu } from './resume-menu.mjs';
import { promptRollbackMenu } from './rollback-menu.mjs';
import { promptRecoveryMenu } from './recovery-menu.mjs';
import { applySettings, formatStartupSettings, reloadSettings, settingsFromEnv } from './settings.mjs';
import { runSetup } from './setup.mjs';

registerHandlers({ log });

function printAgentText(text) {
  const wrapped = wrapText(text, getTerminalWidth());
  process.stdout.write(wrapped.endsWith('\n') ? wrapped : `${wrapped}\n`);
}

function printResumeMessage(label, text) {
  if (!text) return;
  process.stdout.write(`${formatSystemMessage(`${label}:`)}\n`);
  printAgentText(text);
}

function createReplInterface(getCwd, input = defaultInput, output = defaultOutput) {
  return createInterface({ input, output, completer: (line) => completePath(line, getCwd()) });
}

function printUsageReport(totals, { leadingNewline = false, model } = {}) {
  process.stdout.write(`${leadingNewline ? '\n' : ''}${formatSystemMessage(formatUsageReport({ ...totals, model }))}\n`);
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

function createResumeToolCallRunner(mode, pendingCallIds = new Set()) {
  return async (call, cwd) => {
    if (pendingCallIds.has(getToolCallId(call))) {
      return buildInterruptedToolOutput(call, mode);
    }
    const { runToolCall } = await import('./tool-dispatch.mjs');
    return await runToolCall(call, cwd);
  };
}

export async function runAgent({ promptPath, cwd, input: terminalInput = defaultInput, output: terminalOutput = defaultOutput } = {}) {
  const launchCwd = cwd;
  const statePath = path(launchCwd, '.agentx_responseid');
  let template = applySettings(await loadPromptTemplate(promptPath), settingsFromEnv());
  const agentsText = await readAgentsFromCwdAndParents(cwd).catch((error) => {
    throw new Error(`Unable to read AGENTS.md files under ${cwd}: ${error?.message || String(error)}`);
  });
  const savedState = await readSessionState(statePath);
  const savedResponseId = savedState?.response_id || '';
  const apiKey = process.env.agentx_api_key || process.env.AGENTX_API_KEY || (process.env.JEST_WORKER_ID ? 'test-key' : resolveAgentApiKey());
  const debugEnabled = process.argv.includes('--debug');
  const openai = createOpenAIResponsesTransport({ apiKey, debug: debugEnabled });

  process.stdout.write(`${formatStartupSettings(settingsFromEnv())}\n`);
  if (!agentsText) process.stdout.write(`${formatSystemMessage('AGENTS.md not found; ask AgentX to generate one for this project.')}\n`);
  process.stdout.write(`${formatSystemMessage(savedResponseId ? `Resuming conversation ${savedResponseId}` : 'Starting new session')}\n`);
  printResumeMessage('Last user message', savedState?.last_user_message || '');
  printResumeMessage('Last assistant message', savedState?.last_assistant_message || '');
  if (savedState?.failed_response) {
    process.stdout.write(`${formatSystemMessage('Previous request failed; starting from the last successful checkpoint.')}\n`);
  }

  let previousResponseId = savedState?.failed_response ? (savedState?.history?.at(-1)?.response_id || '') : savedResponseId;
  let cwdNote = '';
  let lastUserMessage = savedState?.last_user_message || '';
  let lastAssistantMessage = savedState?.last_assistant_message || '';
  let pendingCliTranscript = savedState?.pending_cli_transcript || '';
  let sessionUsage = savedState?.usage
    ? { inputTokens: Number(savedState.usage.inputTokens ?? 0), cachedTokens: Number(savedState.usage.cachedTokens ?? 0), outputTokens: Number(savedState.usage.outputTokens ?? 0), turns: Number(savedState.usage.turns ?? 0) }
    : createUsageTotals();
  let pendingToolCalls = savedState?.failed_response ? [] : (Array.isArray(savedState?.pending_tool_calls) ? savedState.pending_tool_calls : []);
  let history = Array.isArray(savedState?.history) ? savedState.history : [];
  let rollbackBackup = Array.isArray(savedState?.rollback_backup) ? savedState.rollback_backup : [];
  let failedResponse = Boolean(savedState?.failed_response);

  async function saveState() {
    await persistResponseState(statePath, {
      response_id: previousResponseId,
      usage: sessionUsage,
      last_user_message: lastUserMessage,
      last_assistant_message: lastAssistantMessage,
      pending_cli_transcript: pendingCliTranscript,
      pending_tool_calls: pendingToolCalls,
      history,
      rollback_backup: rollbackBackup,
      failed_response: failedResponse,
    });
  }

  async function persistResponseSnapshot(snapshot) {
    const response = snapshot?.response;
    const nextCalls = Array.isArray(snapshot?.pendingToolCalls) ? snapshot.pendingToolCalls : [];
    previousResponseId = response?.id || previousResponseId;
    pendingToolCalls = nextCalls;
    await saveState();
  }

  async function exitWithSummary({ leadingNewline = false } = {}) {
    printUsageReport(sessionUsage, { leadingNewline, model: template.model });
    rl.close();
    process.exit(0);
  }

  const hasPendingToolCalls = Boolean(previousResponseId && pendingToolCalls.length > 0);
  if (hasPendingToolCalls) {
    const resumeChoice = await promptResumeMenu(savedState, { input: terminalInput, output: terminalOutput });

    if (resumeChoice === 'new-session') {
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
      const runPendingToolCall = resumeChoice === 'auto-resume'
        ? undefined
        : createResumeToolCallRunner(
          resumeChoice === 'interrupt-retry' ? 'retry' : 'request',
          new Set((savedState?.pending_tool_calls || []).map((call) => getToolCallId(call)).filter(Boolean)),
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
            suppressStatusOutput: debugEnabled,
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
          pendingToolCalls = [];
          await saveState();
          process.stdout.write(`${formatSystemMessage(`Pending response failed: ${error?.message || String(error)}. Session preserved.`)}\n`);
        }
      }
    }
  }

  let rl = createReplInterface(() => cwd, terminalInput, terminalOutput);

  try {
    for (; ;) {
      let line;
      try {
        line = await rl.question(formatPromptForCwd(cwd));
      } catch (error) {
        if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
          await exitWithSummary({ leadingNewline: true });
          return;
        }
        throw error;
      }

      const message = line.trim();
      // Handle plain `clear` command to clear the terminal display.
      if (message === 'clear') {
        clearTerminal();
        continue;
      }
      if (!message) continue;

      if (message.startsWith('!')) {
        const command = message.slice(1).trim();
        if (!command) continue;
        const result = await shellExec(command, cwd);
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
        rl.close();
      try {
        await runSetup({ stdin: terminalInput, stdout: terminalOutput });
      } catch (error) {
        const errMsg = error?.message || String(error);
        printAgentText(`Error during setup: ${errMsg}`);
        // Return to REPL without crashing
      }
        template = applySettings(await loadPromptTemplate(promptPath), await reloadSettings());
        process.stdout.write(`${formatSystemMessage('Settings reloaded')}\n`);
        rl = createReplInterface(() => cwd, terminalInput, terminalOutput);
        continue;
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
        sessionUsage = createUsageTotals();
        await clearSession(statePath);
        process.stdout.write(`${formatSystemMessage('Session cleared')}\n`);
        continue;
      }

      if (internal?.type === 'rollback') {
        // The pending readline prompt must not remain attached while the raw-mode menu runs.
        // Otherwise readline can redraw/echo the next line after the menu exits.
        rl.close();
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
            process.stdout.write(`${formatSystemMessage(`Rolled back to ${selected.response_id}`)}\n`);
          } else if (!history.length) {
            process.stdout.write(`${formatSystemMessage('No successful rollback checkpoints available.') }\n`);
          }
        } catch (error) {
          if (error?.name !== 'AbortError') process.stdout.write(`${formatSystemMessage(error?.message || String(error))}\n`);
        }
        rl = createReplInterface(() => cwd, terminalInput, terminalOutput);
        continue;
      }

      if (internal?.type === 'usage') {
        printUsageReport(sessionUsage, { model: template.model });
        continue;
      }

      if (internal?.type === 'cd') {
        try {
          cwd = await resolveCdTarget(internal.target, cwd);
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
      await saveState();
      let response;
      let recoveryAttempts = 0;
      while (!response) {
        const activeOverride = buildRequestOverride(template, requestMessage, agentsText, cwd, previousResponseId);
        try {
          response = await sendMessage(openai, template, previousResponseId, requestMessage, agentsText, cwd, (usage, { skipIncrement = false } = {}) => {
            if (!skipIncrement) {
              addUsageTotals(sessionUsage, usage);
              sessionUsage.turns += 1;
            }
            return sessionUsage;
          }, activeOverride, { liveStreaming: true, sessionStartedAt, onResponseState: persistResponseSnapshot, suppressStatusOutput: debugEnabled });
        } catch (error) {
          if (error?.code === 'previous_response_not_found' && previousResponseId) {
            previousResponseId = '';
            process.stdout.write(`${formatSystemMessage('Previous response not found; starting a new chain.')}\n`);
            continue;
          }
          failedResponse = true;
          pendingToolCalls = [];
          await saveState();
          let choice;
          try { choice = await promptRecoveryMenu(error, { input: terminalInput, output: terminalOutput }); }
          catch (menuError) { if (menuError?.name === 'AbortError') { process.stdout.write(`${formatSystemMessage('Recovery cancelled; session preserved.')}\n`); break; } throw menuError; }
          if (choice === 'retry' && recoveryAttempts < 1) { recoveryAttempts += 1; continue; }
          if (choice === 'new-chain' && recoveryAttempts < 2) { recoveryAttempts += 1; previousResponseId = ''; continue; }
          if (choice === 'rollback') {
            const selected = await promptRollbackMenu(history, { input: terminalInput, output: terminalOutput });
            if (selected) {
              previousResponseId = selected.response_id; lastUserMessage = selected.last_user_message; lastAssistantMessage = selected.last_assistant_message;
              sessionUsage = { ...selected.usage }; const selectedIndex = history.indexOf(selected); rollbackBackup = history.slice(selectedIndex + 1); history = history.slice(0, selectedIndex + 1); failedResponse = false; await saveState();
            }
            break;
          }
          if (choice === 'clear') {
            previousResponseId = ''; lastUserMessage = ''; lastAssistantMessage = ''; pendingCliTranscript = ''; pendingToolCalls = []; history = []; rollbackBackup = []; failedResponse = false; sessionUsage = createUsageTotals(); await clearSession(statePath);
            process.stdout.write(`${formatSystemMessage('Session cleared')}\n`);
            break;
          }
          break;
        }
      }
      if (!response) continue;
      previousResponseId = response?.id || previousResponseId;
      lastAssistantMessage = extractTextFromResponse(response);
      pendingToolCalls = [];
      pendingCliTranscript = '';
      failedResponse = false;
      rollbackBackup = [];
      if (response?.id) {
        history = [...history, { response_id: response.id, timestamp: new Date().toISOString(), user_preview: message.slice(0, 20), assistant_preview: lastAssistantMessage.slice(0, 20), usage: { ...sessionUsage }, last_user_message: lastUserMessage, last_assistant_message: lastAssistantMessage }].slice(-20);
      }
      await saveState();
    }
  } finally {
    rl.close();
  }
}
