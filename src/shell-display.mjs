const YELLOW = '\u001b[33m';
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
