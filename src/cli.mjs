import { readFileSync } from 'node:fs';
import path from 'node:path';

const packagePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'package.json');

export function hasFlag(argv, flags) {
  return argv.some((arg) => flags.includes(arg));
}

const shortOutputFlags = {
  u: 'noUsage', c: 'noColors', t: 'noTimers', r: 'noReasoning',
  s: 'noShellCalls', o: 'noToolCalls', m: 'noMcp', w: 'noWebsearch', q: 'quiet',
};

const longFlags = {
  '--debug': 'debug', '--confirm': 'confirm', '--yolo': 'yolo', '--quiet': 'quiet',
  '--no-usage': 'noUsage', '--no-colors': 'noColors', '--no-timers': 'noTimers',
  '--no-reasoning': 'noReasoning', '--no-shell-calls': 'noShellCalls',
  '--no-tool-calls': 'noToolCalls', '--no-mcp': 'noMcp', '--no-websearch': 'noWebsearch',
};

export function parseCliArgs(argv = []) {
  const flags = { debug: false, confirm: false, yolo: false, quiet: false, noUsage: false, noColors: false, noTimers: false, noReasoning: false, noShellCalls: false, noToolCalls: false, noMcp: false, noWebsearch: false, help: false, version: false, cwd: null };
  const messageArgs = [];
  let passthrough = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (passthrough) { messageArgs.push(arg); continue; }
    if (arg === '--') { passthrough = true; continue; }
    if (arg === '--cwd' || arg === '-C') {
      flags.cwd = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--cwd=')) { flags.cwd = arg.slice('--cwd='.length); continue; }
    if (arg === '--help' || arg === '-h' || arg === '-?') { flags.help = true; continue; }
    if (arg === '--version' || arg === '-v') { flags.version = true; continue; }
    if (Object.hasOwn(longFlags, arg)) { flags[longFlags[arg]] = true; continue; }
    if (/^-[a-z]+$/.test(arg) && arg.length > 1 && arg.slice(1).split('').every((letter) => Object.hasOwn(shortOutputFlags, letter))) {
      for (const letter of arg.slice(1)) flags[shortOutputFlags[letter]] = true;
      continue;
    }
    messageArgs.push(arg);
  }
  return { flags, messageArgs };
}

export function normalizeOutputFlags(flags = {}) {
  const quiet = Boolean(flags.quiet);
  return {
    ...flags,
    quiet,
    noUsage: quiet || Boolean(flags.noUsage),
    noColors: Boolean(flags.noColors),
    noTimers: quiet || Boolean(flags.noTimers),
    noReasoning: Boolean(flags.noReasoning),
    noShellCalls: quiet || Boolean(flags.noShellCalls),
    noToolCalls: quiet || Boolean(flags.noToolCalls),
    noMcp: quiet || Boolean(flags.noMcp),
    noWebsearch: quiet || Boolean(flags.noWebsearch),
  };
}

export function getPackageVersion() {
  const raw = readFileSync(packagePath, 'utf8');
  return JSON.parse(raw).version || 'unknown';
}

export function formatQuickHelp(version = getPackageVersion()) {
  return [
    `AgentX ${version}`,
    'Usage: agentx [flags] [message...]',
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
    '  /goal TEXT   work autonomously toward a goal',
    '  /goal status show active goal status',
    '  /goal cancel cancel the active goal',
    '  /stop        cancel the active goal',
    '  /setup       edit settings and reload them',
    '  quit/exit    leave AgentX',
    '',
    'Flags:',
    '  --help, -h, -?   show this help',
    '  --version, -v    print the package version',
    '  --debug          print raw websocket logs and suppress live status lines',
    '  --cwd PATH, -C PATH  use PATH as the working directory',
    '  --confirm        enable tool confirmation prompts',
    '  --yolo           legacy alias; bypass tool confirmation prompts',
    '  --quiet, -q      suppress usage, timers, and tool/status output (keeps reasoning)',
    '  --no-usage, -u   suppress usage output',
    '  --no-colors, -c  suppress ANSI colors',
    '  --no-timers, -t  suppress status timer output',
    '  --no-reasoning, -r  suppress reasoning output',
    '  --no-shell-calls, -s  suppress shell-call output',
    '  --no-tool-calls, -o  suppress non-shell tool-call output',
    '  --no-mcp, -m     suppress MCP output',
    '  --no-websearch, -w  suppress web-search output',
    '  Short output flags may be stacked, for example: -qur',
  ].join('\n');
}
