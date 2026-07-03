import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { log, registerHandlers, path } from '@eliware/common';
import { createOpenAI } from '@eliware/openai';
import { completePath } from './completion.mjs';
import { extractTextFromResponse, extractUsage, persistResponseState, clearSession, sendMessage, readSessionState } from './agent-session.mjs';
import { buildWorkingDirectoryNote, clearTerminal, formatPromptForCwd, formatSystemMessage, parseInternalCommand, readAgentsFromCwdAndParents, resolveCdTarget } from './shell.mjs';
import { readJson } from './runtime.mjs';
import { createUsageTotals, addUsageTotals, addTurn, formatUsageReport, formatTurnUsageReport } from './response.mjs';
import { getTerminalWidth, wrapText } from './text-wrap.mjs';

registerHandlers({ log });

function printAgentText(text) {
  const wrapped = wrapText(text, getTerminalWidth());
  process.stdout.write(wrapped.endsWith('\n') ? wrapped : `${wrapped}\n`);
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

export async function runAgent({ promptPath, cwd }) {
  const launchCwd = cwd;
  const statePath = path(launchCwd, '.agentx_responseid');
  const template = await readJson(promptPath);
  const agentsText = await readAgentsFromCwdAndParents(cwd);
  const savedState = await readSessionState(statePath);
  const savedResponseId = savedState?.response_id || '';

  if (!agentsText) process.stdout.write(`${formatSystemMessage('AGENTS.md not found')}\n`);
  process.stdout.write(`${formatSystemMessage(savedResponseId ? `Resuming conversation ${savedResponseId}` : 'Starting new session')}\n`);

  const debugEnabled = process.argv.includes('--debug');
  const debugLog = (...args) => {
    if (debugEnabled) console.log(...args);
  };

  const openai = await createOpenAI(process.env.agentx_api_key || process.env.AGENTX_API_KEY);
  const rl = createReplInterface(cwd);
  let previousResponseId = savedResponseId;
  let cwdNote = '';
  let sessionUsage = savedState?.usage
    ? { inputTokens: Number(savedState.usage.inputTokens ?? 0), cachedTokens: Number(savedState.usage.cachedTokens ?? 0), outputTokens: Number(savedState.usage.outputTokens ?? 0), turns: Number(savedState.usage.turns ?? 0) }
    : createUsageTotals();

  async function saveState() {
    await persistResponseState(statePath, { response_id: previousResponseId, usage: sessionUsage });
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

      const requestMessage = cwdNote ? `${cwdNote}\n\n${message}` : message;
      cwdNote = '';
      const turnUsage = createUsageTotals();
      const request = previousResponseId
        ? {
            model: template.model,
            input: [{ role: 'user', content: [{ type: 'input_text', text: requestMessage }] }],
            store: true,
            tools: template.tools,
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
      const response = await sendMessage(openai, template, previousResponseId, requestMessage, agentsText, cwd, (usage) => addUsageTotals(turnUsage, usage), request);
      if (debugEnabled) {
        debugLog('OpenAI response:', JSON.stringify(response, null, 2));
      }
      previousResponseId = response?.id || previousResponseId;
      addUsageTotals(sessionUsage, turnUsage);
      addTurn(sessionUsage);
      await saveState();
      const text = extractTextFromResponse(response);
      if (text) printAgentText(text);
      printTurnUsage(turnUsage);
      printCumulativeUsage(sessionUsage);
    }
  } finally {
    rl.close();
  }
}
