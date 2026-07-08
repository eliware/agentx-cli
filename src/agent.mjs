import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { log, registerHandlers, path } from '@eliware/common';
import { createOpenAIResponsesTransport } from './openai-transport.mjs';
import { shellExec } from './tool-shell.mjs';
import { completePath } from './completion.mjs';
import { clearSession, extractTextFromResponse, handleToolCalls, persistResponseState, readSessionState, sendMessage } from './agent-session.mjs';
import { buildWorkingDirectoryNote, clearTerminal, formatPromptForCwd, formatSystemMessage, parseInternalCommand, readAgentsFromCwdAndParents, resolveCdTarget } from './shell.mjs';
import { createUsageTotals, addUsageTotals, formatUsageReport } from './response.mjs';
import { getTerminalWidth, wrapText } from './text-wrap.mjs';
import { appendCliTranscript, buildRequestMessage, buildRequestOverride, loadPromptTemplate, resolveAgentApiKey } from './agent-flow.mjs';

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

function createReplInterface(cwd) {
  return createInterface({ input, output, completer: (line) => completePath(line, cwd) });
}

function printUsageReport(totals, { leadingNewline = false } = {}) {
  process.stdout.write(`${leadingNewline ? '\n' : ''}${formatSystemMessage(formatUsageReport(totals))}\n`);
}

function toApiUsage(usage = {}) {
  return {
    input_tokens: Number(usage?.inputTokens ?? 0),
    input_tokens_details: { cached_tokens: Number(usage?.cachedTokens ?? 0) },
    output_tokens: Number(usage?.outputTokens ?? 0),
  };
}

function createPendingResponse(savedState) {
  return {
    id: String(savedState?.response_id ?? ''),
    output: Array.isArray(savedState?.pending_tool_calls) ? savedState.pending_tool_calls : [],
    usage: toApiUsage(savedState?.pending_response_usage),
  };
}

async function promptResumeInterruptedSession(savedState) {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(formatSystemMessage(`Session was interrupted while tool calls were pending for ${savedState.response_id}. Resume execution? [y/N] `));
    return /^y(es)?$/i.test(String(answer ?? '').trim());
  } finally {
    rl.close();
  }
}

export async function runAgent({ promptPath, cwd }) {
  const launchCwd = cwd;
  const statePath = path(launchCwd, '.agentx_responseid');
  const template = await loadPromptTemplate(promptPath);
  const agentsText = await readAgentsFromCwdAndParents(cwd).catch((error) => {
    throw new Error(`Unable to read AGENTS.md files under ${cwd}: ${error?.message || String(error)}`);
  });
  const savedState = await readSessionState(statePath);
  const savedResponseId = savedState?.response_id || '';
  const apiKey = resolveAgentApiKey();
  const debugEnabled = process.argv.includes('--debug');
  const openai = createOpenAIResponsesTransport({ apiKey, debug: debugEnabled });

  if (!agentsText) process.stdout.write(`${formatSystemMessage('AGENTS.md not found')}\n`);
  process.stdout.write(`${formatSystemMessage(savedResponseId ? `Resuming conversation ${savedResponseId}` : 'Starting new session')}\n`);
  printResumeMessage('Last user message', savedState?.last_user_message || '');
  printResumeMessage('Last assistant message', savedState?.last_assistant_message || '');

  let previousResponseId = savedResponseId;
  let cwdNote = '';
  let lastUserMessage = savedState?.last_user_message || '';
  let lastAssistantMessage = savedState?.last_assistant_message || '';
  let pendingCliTranscript = savedState?.pending_cli_transcript || '';
  let sessionUsage = savedState?.usage
    ? { inputTokens: Number(savedState.usage.inputTokens ?? 0), cachedTokens: Number(savedState.usage.cachedTokens ?? 0), outputTokens: Number(savedState.usage.outputTokens ?? 0), turns: Number(savedState.usage.turns ?? 0) }
    : createUsageTotals();
  let pendingToolCalls = Array.isArray(savedState?.pending_tool_calls) ? savedState.pending_tool_calls : [];
  let pendingResponseUsage = savedState?.pending_response_usage ? {
    inputTokens: Number(savedState.pending_response_usage.inputTokens ?? 0),
    cachedTokens: Number(savedState.pending_response_usage.cachedTokens ?? 0),
    outputTokens: Number(savedState.pending_response_usage.outputTokens ?? 0),
  } : null;

  async function saveState() {
    await persistResponseState(statePath, {
      response_id: previousResponseId,
      usage: sessionUsage,
      last_user_message: lastUserMessage,
      last_assistant_message: lastAssistantMessage,
      pending_cli_transcript: pendingCliTranscript,
      pending_tool_calls: pendingToolCalls,
      pending_response_usage: pendingResponseUsage,
    });
  }

  async function persistResponseSnapshot(response, usage, calls) {
    previousResponseId = response?.id || previousResponseId;
    pendingToolCalls = Array.isArray(calls) ? calls : [];
    pendingResponseUsage = pendingToolCalls.length > 0
      ? {
        inputTokens: Number(usage?.inputTokens ?? 0),
        cachedTokens: Number(usage?.cachedTokens ?? 0),
        outputTokens: Number(usage?.outputTokens ?? 0),
      }
      : null;
    await saveState();
  }

  async function exitWithSummary({ leadingNewline = false } = {}) {
    printUsageReport(sessionUsage, { leadingNewline });
    rl.close();
    process.exit(0);
  }

  const hasPendingToolCalls = Boolean(previousResponseId && pendingToolCalls.length > 0);
  if (hasPendingToolCalls) {
    const shouldResume = await promptResumeInterruptedSession(savedState);
    if (shouldResume) {
      process.stdout.write(`${formatSystemMessage('Resuming pending tool execution')}\n`);
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
          undefined,
          {
            liveStreaming: true,
            sessionStartedAt: Date.now(),
            skipInitialUsageAccounting: true,
            onResponseState: persistResponseSnapshot,
          },
        );
        previousResponseId = resumedResponse?.id || previousResponseId;
        lastAssistantMessage = extractTextFromResponse(resumedResponse);
        pendingToolCalls = [];
        pendingResponseUsage = null;
        await saveState();
      } catch (error) {
        if (error?.code === 'previous_response_not_found') {
          process.stdout.write(`${formatSystemMessage('Pending response not found; clearing session')}\n`);
          previousResponseId = '';
          lastUserMessage = '';
          lastAssistantMessage = '';
          pendingCliTranscript = '';
          pendingToolCalls = [];
          pendingResponseUsage = null;
          sessionUsage = createUsageTotals();
          await clearSession(statePath);
        } else {
          throw error;
        }
      }
    } else {
      previousResponseId = '';
      lastUserMessage = '';
      lastAssistantMessage = '';
      pendingCliTranscript = '';
      pendingToolCalls = [];
      pendingResponseUsage = null;
      sessionUsage = createUsageTotals();
      await clearSession(statePath);
      process.stdout.write(`${formatSystemMessage('Session cleared')}\n`);
    }
  }

  const rl = createReplInterface(cwd);

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
      if (!message) continue;

      if (message.startsWith('>')) {
        const command = message.slice(1).trim();
        if (!command) continue;
        const result = await shellExec(command, cwd);
        pendingCliTranscript = appendCliTranscript(pendingCliTranscript, command, result);
        await saveState();
        continue;
      }

      const internal = parseInternalCommand(message);
      if (internal?.type === 'exit') {
        await exitWithSummary();
        return;
      }

      if (internal?.type === 'clear') {
        clearTerminal();
        continue;
      }

      if (internal?.type === 'session_clear') {
        printUsageReport(sessionUsage);
        previousResponseId = '';
        lastUserMessage = '';
        lastAssistantMessage = '';
        pendingCliTranscript = '';
        pendingToolCalls = [];
        pendingResponseUsage = null;
        sessionUsage = createUsageTotals();
        await clearSession(statePath);
        process.stdout.write(`${formatSystemMessage('Session cleared')}\n`);
        continue;
      }

      if (internal?.type === 'usage') {
        printUsageReport(sessionUsage);
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
      const requestOverride = buildRequestOverride(template, requestMessage, agentsText, cwd, previousResponseId);
      let response;
      try {
        response = await sendMessage(openai, template, previousResponseId, requestMessage, agentsText, cwd, (usage, { skipIncrement = false } = {}) => {
          if (!skipIncrement) {
            addUsageTotals(sessionUsage, usage);
            sessionUsage.turns += 1;
          }
          return sessionUsage;
        }, requestOverride, { liveStreaming: true, sessionStartedAt, onResponseState: persistResponseSnapshot });
      } catch (error) {
        if (error?.code === 'previous_response_not_found' && previousResponseId) {
          process.stdout.write(`${formatSystemMessage('Previous response not found; starting a new chain')}\n`);
          previousResponseId = '';
          const retryOverride = buildRequestOverride(template, requestMessage, agentsText, cwd, previousResponseId);
          response = await sendMessage(openai, template, previousResponseId, requestMessage, agentsText, cwd, (usage, { skipIncrement = false } = {}) => {
            if (!skipIncrement) {
              addUsageTotals(sessionUsage, usage);
              sessionUsage.turns += 1;
            }
            return sessionUsage;
          }, retryOverride, { liveStreaming: true, sessionStartedAt, onResponseState: persistResponseSnapshot });
        } else {
          throw error;
        }
      }
      previousResponseId = response?.id || previousResponseId;
      lastAssistantMessage = extractTextFromResponse(response);
      pendingToolCalls = [];
      pendingResponseUsage = null;
      pendingCliTranscript = '';
      await saveState();
    }
  } finally {
    rl.close();
  }
}
