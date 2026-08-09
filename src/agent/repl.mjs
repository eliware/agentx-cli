import { createInterface } from 'node:readline/promises';
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';
import { completePath } from '../completion.mjs';
import { formatFinalUsageMessage, formatWhiteMessage } from '../shell-display.mjs';
import { formatPromptForCwd, formatSystemMessage } from '../shell.mjs';
import { getTerminalWidth, wrapText } from '../text-wrap.mjs';
import { formatUsageReport } from '../response.mjs';

export function printAgentText(text) { const wrapped = wrapText(text, getTerminalWidth()); process.stdout.write(formatWhiteMessage(wrapped.endsWith('\n') ? wrapped : `${wrapped}\n`)); }
export function printResumeMessage(label, text) { if (!text) return; process.stdout.write(`${formatSystemMessage(`${label}:`)}\n`); printAgentText(text); }
export function createReplInterface(getCwd, input = defaultInput, output = defaultOutput, history = []) { const rl = createInterface({ input, output, completer: (line) => completePath(line, getCwd()) }); if (Array.isArray(history)) rl.history = [...history]; return rl; }
export function printUsageReport(totals, { leadingNewline = false, model } = {}) { process.stdout.write(`${leadingNewline ? '\n' : ''}${formatFinalUsageMessage(formatUsageReport({ ...totals, model }))}\n`); }
export function promptForCwd(cwd) { return formatPromptForCwd(cwd); }
