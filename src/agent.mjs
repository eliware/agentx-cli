import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { log, registerHandlers, path } from '@eliware/common';
import { createOpenAI } from '@eliware/openai';
import { shellExec } from './tool-shell.mjs';
import { completePath } from './completion.mjs';
import { compactSession, extractTextFromResponse, isContextWindowExceeded, persistResponseState, clearSession, sendMessage, readSessionState } from './agent-session.mjs';
import { buildWorkingDirectoryNote, clearTerminal, formatPromptForCwd, formatSystemMessage, parseInternalCommand, readAgentsFromCwdAndParents, resolveCdTarget } from './shell.mjs';
import { readJson } from './runtime.mjs';
import { createUsageTotals, addUsageTotals, addTurn, formatUsageReport, formatTurnUsageReport } from './response.mjs';
import { getTerminalWidth, wrapText } from './text-wrap.mjs';

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

function printTurnUsage(turnUsage) {
  process.stdout.write(`${formatSystemMessage(formatTurnUsageReport(turnUsage))}\n`);
}

function printCumulativeUsage(sessionUsage) {
  process.stdout.write(`${formatSystemMessage(formatUsageReport(sessionUsage))}\n`);
}

function printRestoredSession(savedState) {
  if (savedState?.last_user_message || savedState?.last_assistant_message) {
    printResumeMessage('Last user message', savedState.last_user_message);
    printResumeMessage('Last assistant message', savedState.last_assistant_message);
  }
}

function appendCliTranscript(existingTranscript, command, outputText) {
  const entry = [`> ${command}`];
  const trimmedOutput = String(outputText ?? '').trimEnd();
  if (trimmedOutput) entry.push(trimmedOutput);
  return [existingTranscript, entry.join('\n')].filter(Boolean).join('\n\n');
}

function buildRequestMessage({ pendingCliTranscript, cwdNote, message }) {
  const contextParts = [];
  if (pendingCliTranscript) {
    contextParts.push(`Local shell commands and output since the last assistant message:\n\n${pendingCliTranscript}`);
  }
  if (cwdNote) {
    contextParts.push(cwdNote);
  }
  contextParts.push(message);
  return contextParts.join('\n\n');
}

export async function runAgent({ promptPath, cwd }) {
  const launchCwd = cwd;
  const statePath = path(launchCwd, '.agentx_responseid');
  const template = await readJson(promptPath);
  const agentsText = await readAgentsFromCwdAndParents(cwd);
  const savedState = await readSessionState(statePath);
  const savedResponseId = savedState?.response_id || '';

  if (!agentsText) process.stdout.write(`${formatSystemMessage('AGENTS.md not found')}\n`);
  process.stdout.write(`${formatSystemMessage(savedResponseId ? `Resuming conversation ${savedResponseId}` : 'Starting new session')}\n`);
  printRestoredSession(savedState);

  const debugEnabled = process.argv.includes('--debug');
  const debugLog = (...args) => {
    if (debugEnabled) console.log(...args);
  };

  const openai = await createOpenAI(process.env.agentx_api_key || process.env.AGENTX_API_KEY);
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
    for (;;) {
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
        process.stdout.write(`${formatSystemMessage(`Running shell command: ${command}`)}\n`);
        const result = await shellExec(command, cwd);
        if (result) process.stdout.write(result.endsWith('\n') ? result : `${result}\n`);
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

      if (internal?.type === 'compact') {
        if (!previousResponseId) {
          process.stdout.write(`${formatSystemMessage('No active session to compact')}\n`);
          continue;
        }
        const turnUsage = createUsageTotals();
        process.stdout.write(`${formatSystemMessage('Compacting session context...')}\n`);
        const compacted = await compactSession(openai, template, previousResponseId, agentsText, cwd, '', (usage) => addUsageTotals(turnUsage, usage));
        previousResponseId = compacted.response?.id || previousResponseId;
        addUsageTotals(sessionUsage, turnUsage);
        addTurn(sessionUsage);
        lastAssistantMessage = extractTextFromResponse(compacted.response);
        await saveState();
        const text = lastAssistantMessage;
        if (text) printAgentText(text);
        printTurnUsage(turnUsage);
        printCumulativeUsage(sessionUsage);
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
      cwdNote = '';
      const turnUsage = createUsageTotals();
      const request = previousResponseId
        ? {
            ...template,
            input: [{ role: 'user', content: [{ type: 'input_text', text: requestMessage }] }],
            store: true,
            previous_response_id: previousResponseId,
          }
        : {
            ...template,
            input: template.input?.map?.((item) => ({ ...item, content: item.content?.map?.((part) => ({ ...part })) })),
            store: true,
          };
      if (!previousResponseId) {
        const developer = request?.input?.find?.((item) => item?.role === 'developer');
        const developerContent = developer?.content?.[0];
        if (developerContent?.type === 'input_text') {
          const { buildDeveloperText } = await import('./prompt-text.mjs');
          developerContent.text = buildDeveloperText(request, agentsText, cwd);
        }
        const firstUser = request?.input?.find?.((item) => item?.role === 'user');
        const firstContent = firstUser?.content?.[0];
        if (firstContent?.type === 'input_text') {
          const original = String(firstContent.text ?? '');
          firstContent.text = original.includes('first user message')
            ? original.replaceAll('first user message', requestMessage)
            : requestMessage;
        }
      }
      if (debugEnabled) {
        debugLog('OpenAI request:', JSON.stringify(request, null, 2));
      }
      let response;
      try {
        response = await sendMessage(openai, template, previousResponseId, requestMessage, agentsText, cwd, (usage) => addUsageTotals(turnUsage, usage), request);
      } catch (error) {
        if (!previousResponseId || !isContextWindowExceeded(error)) throw error;
        process.stdout.write(`${formatSystemMessage('Context window exceeded; compacting session context and retrying...')}\n`);
        const compacted = await compactSession(openai, template, previousResponseId, agentsText, cwd, requestMessage, (usage) => addUsageTotals(turnUsage, usage));
        response = compacted.response;
      }
      if (debugEnabled) {
        debugLog('OpenAI response:', JSON.stringify(response, null, 2));
      }
      previousResponseId = response?.id || previousResponseId;
      lastUserMessage = message;
      lastAssistantMessage = extractTextFromResponse(response);
      pendingCliTranscript = '';
      addUsageTotals(sessionUsage, turnUsage);
      addTurn(sessionUsage);
      await saveState();
      const text = lastAssistantMessage;
      if (text) printAgentText(text);
      printTurnUsage(turnUsage);
      printCumulativeUsage(sessionUsage);
    }
  } finally {
    rl.close();
  }
}
