import { getPromptIdentity } from './platform.mjs';

const YELLOW = '\u001b[33m';
const GREEN = '\u001b[32m';
const LIGHT_BLUE = '\u001b[94m';
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
  return `[${YELLOW}AgentX ${user}@${host}:${cwd}${RESET}] `;
}

export function formatSystemMessage(message) {
  return `${YELLOW}${message}${RESET}`;
}

export function formatCommandMessage(message) {
  return `${GREEN}${message}${RESET}`;
}

export function formatInfoMessage(message) {
  return `${LIGHT_BLUE}${message}${RESET}`;
}
