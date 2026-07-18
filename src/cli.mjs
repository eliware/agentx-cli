import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');

export function hasFlag(argv, flags) {
  return argv.some((arg) => flags.includes(arg));
}

export function getPackageVersion() {
  const raw = readFileSync(packagePath, 'utf8');
  return JSON.parse(raw).version || 'unknown';
}

export function formatQuickHelp(version = getPackageVersion()) {
  return [
    `AgentX ${version}`,
    'Usage: agentx [--help|-h|-?] [--version|-v] [--debug]',
    '',
    'Chat:',
    '  normal text  send a message to OpenAI',
    '  cd <path>    change the local working directory',
    '  >command     run a local shell command',
    '',
    'Commands:',
    '  clear        reset the saved session',
    '  >clear       clear the terminal',
    '  /usage       show token and cost totals',
    '  /setup       edit settings and reload them',
    '  quit/exit    leave AgentX',
    '',
    'Flags:',
    '  --help, -h, -?   show this help',
    '  --version, -v    print the package version',
    '  --debug          print raw websocket logs and suppress live status lines',
  ].join('\n');
}
