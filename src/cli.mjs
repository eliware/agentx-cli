import { readFileSync } from 'node:fs';
import path from 'node:path';

const packagePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'package.json');

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
    'Usage: agentx [--help|-h|-?] [--version|-v] [--debug] [--yolo] [--confirm] [message...]',
    '',
    'Chat:',
    '  normal text  send a message to OpenAI',
    "  agentx 'message'  send once, print summary, then exit",
    '  cd <path>    change the local working directory',
    '  !command     run a local shell command',
    '',
    'Commands:',
    '  clear        reset the saved session',
    '  !clear       clear the terminal',
    '  /usage       show token and cost totals',
    '  /setup       edit settings and reload them',
    '  quit/exit    leave AgentX',
    '',
    'Flags:',
    '  --help, -h, -?   show this help',
    '  --version, -v    print the package version',
    '  --debug          print raw websocket logs and suppress live status lines',
    '  --confirm        enable tool confirmation prompts',
    '  --yolo           legacy alias; bypass tool confirmation prompts',
  ].join('\n');
}
