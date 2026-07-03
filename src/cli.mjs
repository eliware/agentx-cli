const YELLOW = '\u001b[33m';
const RESET = '\u001b[0m';

export function buildCliPrompt({ user = 'root', host = 'dev', cwd = '/opt', name = 'AgentX' } = {}) {
  return `[${YELLOW}${name} ${user}@${host}:${cwd}${RESET}] `;
}
