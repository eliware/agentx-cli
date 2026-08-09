import { getPromptIdentity } from './platform.mjs';

const SYSTEM_RED = '\u001b[38;5;160m';
const COMMAND_GREEN = '\u001b[32m';
const FINAL_BLUE = '\u001b[38;5;33m';
const INFO_CYAN = '\u001b[38;5;37m';
const MCP_CYAN = '\u001b[38;5;45m';
const CUSTOM_MAGENTA = '\u001b[38;5;163m';
const USAGE_ORANGE = '\u001b[38;5;208m';
const WHITE = '\u001b[38;5;255m';
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
  return `${INFO_CYAN}${user}@${shortHost}:${cwd}${WHITE}#${RESET}${WHITE} `;
}

export function formatSystemMessage(message) {
  return `${SYSTEM_RED}${message}${RESET}`;
}

export function formatCommandMessage(message) {
  return `${COMMAND_GREEN}${message}${RESET}`;
}

export function formatMcpMessage(message) {
  return `${MCP_CYAN}${message}${RESET}`;
}

export function formatCustomToolMessage(message) {
  return `${CUSTOM_MAGENTA}${message}${RESET}`;
}

export function formatInfoMessage(message) {
  return `${INFO_CYAN}${message}${RESET}`;
}

export function formatUsageMessage(message) {
  return `${USAGE_ORANGE}${message}${RESET}`;
}

export function formatFinalUsageMessage(message) {
  return `${FINAL_BLUE}${message}${RESET}`;
}

export function formatWhiteMessage(message) { return `${WHITE}${message}${RESET}`; }
