import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { log, registerHandlers, path } from '@eliware/common';
import { createOpenAIResponsesTransport } from './openai-transport.mjs';
import { shellExec } from './tool-shell.mjs';
import { completePath } from './completion.mjs';
import { clearSession, extractTextFromResponse, persistResponseState, readSessionState, sendMessage } from './agent-session.mjs';
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

function printRestoredSession(savedState) {
  if (savedState?.last_user_message || savedState?.last_assistant_message) {
    printResumeMessage('Last user message', savedState.last_user_message);
    printResumeMessage('Last assistant message', savedState.last_assistant_message);
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

  if (!agentsText) process.stdout.write(`${formatSystemMessage('AGENTS.md not found')}\n`);
  process.stdout.write(`${formatSystemMessage(savedResponseId ? `Resuming conversation ${savedResponseId}` : 'Starting new session')}\n`);
  printRestoredSession(savedState);

  const debugEnabled = process.argv.includes('--debug');
  const openai = createOpenAIResponsesTransport({ apiKey, debug: debugEnabled });

  const rl = createReplInterface(cwd);
  let previousResponseId = savedResponseId;
  let cwdNote = '';
  let lastUserMessage = savedState?.last_user_message || '';
  let lastAssistantMessage = savedState?.last_assistant_message || '';
  let pendingCliTranscript = savedState?.pending_cli_transcript || '';
  let sessionUsage = savedState?.usage
    ? { inputTokens: Number(savedState.usage.inputTokens ?? 0), cachedTokens: Number(savedState.usage.cachedTokens ?? 0), outputTokens: Number(savedState.usage.outputTokens ?? 0), turns: Number(savedState.usage.turns ?? 0) }
    : createUsageTotals();

  async function saveState() {
    await persistResponseState(statePath, {
      response_id: previousResponseId,
      usage: sessionUsage,
      last_user_message: lastUserMessage,
      last_assistant_message: lastAssistantMessage,
      pending_cli_transcript: pendingCliTranscript,
    });
  }

  async function exitWithSummary({ leadingNewline = false } = {}) {
    printUsageReport(sessionUsage, { leadingNewline });
    rl.close();
    process.exit(0);
  }

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
      const requestOverride = buildRequestOverride(template, requestMessage, agentsText, cwd, previousResponseId);
      let response;
      try {
        response = await sendMessage(openai, template, previousResponseId, requestMessage, agentsText, cwd, (usage) => {
          addUsageTotals(sessionUsage, usage);
          sessionUsage.turns += 1;
          return sessionUsage;
        }, requestOverride, { liveStreaming: true, sessionStartedAt });
      } catch (error) {
        if (error?.code === 'previous_response_not_found' && previousResponseId) {
          process.stdout.write(`${formatSystemMessage('Previous response not found; starting a new chain')}\n`);
          previousResponseId = '';
          const retryOverride = buildRequestOverride(template, requestMessage, agentsText, cwd, previousResponseId);
          response = await sendMessage(openai, template, previousResponseId, requestMessage, agentsText, cwd, (usage) => {
            addUsageTotals(sessionUsage, usage);
            sessionUsage.turns += 1;
            return sessionUsage;
          }, retryOverride, { liveStreaming: true, sessionStartedAt });
        } else {
          throw error;
        }
      }
      previousResponseId = response?.id || previousResponseId;
      lastUserMessage = message;
      lastAssistantMessage = extractTextFromResponse(response);
      pendingCliTranscript = '';
      await saveState();
    }
  } finally {
    rl.close();
  }
}
