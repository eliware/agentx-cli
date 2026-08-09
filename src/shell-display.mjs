import { getPromptIdentity } from './platform.mjs';

const YELLOW = '\u001b[33m';
const GREEN = '\u001b[32m';
const LIGHT_BLUE = '\u001b[94m';
const BLUE = '\u001b[34m';
const CYAN = '\u001b[36m';
const ORANGE = '\u001b[38;5;214m';
const RESET = '\u001b[0m';

export function clearTerminal() {
  if (process.stdout?.isTTY === false) {
    process.stdout.write('\n');
    return;
  }
  process.stdout.write('\x1b[2J\x1b[H');
}

export function formatPromptForCwd(cwd) {
  const { user, host } = getPromptIdentity(process.env);
  const shortHost = host.split('.')[0];
  return `${LIGHT_BLUE}${user}@${shortHost}:${cwd}#${RESET} `;
}

export function formatSystemMessage(message) {
  return `${YELLOW}${message}${RESET}`;
}

export function formatCommandMessage(message) {
  return `${GREEN}${message}${RESET}`;
}

export function formatMcpMessage(message) {
  return `${CYAN}${message}${RESET}`;
}

export function formatCustomToolMessage(message) {
  return `${ORANGE}${message}${RESET}`;
}

export function formatInfoMessage(message) {
  return `${LIGHT_BLUE}${message}${RESET}`;
}

export function formatUsageMessage(message) {
  return `${YELLOW}${message}${RESET}`;
}

export function formatFinalUsageMessage(message) {
  return `${BLUE}${message}${RESET}`;
}
