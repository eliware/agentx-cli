const YELLOW = '\u001b[33m';
const GREEN = '\u001b[32m';
const LIGHT_BLUE = '\u001b[94m';
const RESET = '\u001b[0m';

export function clearTerminal() {
  process.stdout.write('\x1Bc');
}

export function formatPromptForCwd(cwd) {
  return `[${YELLOW}AgentX ${process.env.USER || 'root'}@dev:${cwd}${RESET}] `;
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
