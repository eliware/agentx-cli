const shortOutputFlags = {
  u: "noUsage",
  c: "noColors",
  t: "noTimers",
  r: "noReasoning",
  s: "noShellCalls",
  o: "noToolCalls",
  m: "noMcp",
  M: "noMcpOutput",
  w: "noWebsearch",
  q: "quiet",
};

const longFlags = {
  "--debug": "debug",
  "--confirm": "confirm",
  "--yolo": "yolo",
  "--quiet": "quiet",
  "--no-usage": "noUsage",
  "--no-colors": "noColors",
  "--no-timers": "noTimers",
  "--no-reasoning": "noReasoning",
  "--no-shell-calls": "noShellCalls",
  "--no-tool-calls": "noToolCalls",
  "--no-mcp": "noMcp",
  "--no-mcp-output": "noMcpOutput",
  "--no-websearch": "noWebsearch",
  "--check-mcp": "checkMcp",
};

export function parseCliArgs(argv = []) {
  const flags = {
    debug: false,
    confirm: false,
    yolo: false,
    quiet: false,
    noUsage: false,
    noColors: false,
    noTimers: false,
    noReasoning: false,
    noShellCalls: false,
    noToolCalls: false,
    noMcp: false,
    noMcpOutput: false,
    noWebsearch: false,
    help: false,
    version: false,
    cwd: null,
    checkMcp: false,
  };
  const messageArgs = [];
  let passthrough = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (passthrough) {
      messageArgs.push(arg);
      continue;
    }
    if (arg === "--") {
      passthrough = true;
      continue;
    }
    if (arg === "--cwd" || arg === "-C") {
      const value = argv[index + 1];
      flags.cwd = value && value !== "--" && !value.startsWith("-") ? value : "";
      if (value && value !== "--" && !value.startsWith("-")) index += 1;
      continue;
    }
    if (arg.startsWith("--cwd=")) {
      const value = arg.slice("--cwd=".length);
      flags.cwd = value && !value.startsWith("-") ? value : "";
      continue;
    }
    if (arg === "--help" || arg === "-h" || arg === "-?") {
      flags.help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      flags.version = true;
      continue;
    }
    if (arg === "-K") {
      flags.checkMcp = true;
      continue;
    }
    if (Object.hasOwn(longFlags, arg)) {
      flags[longFlags[arg]] = true;
      continue;
    }
    if (
      /^-[a-z]+$/.test(arg) &&
      arg.length > 1 &&
      arg
        .slice(1)
        .split("")
        .every((letter) => Object.hasOwn(shortOutputFlags, letter))
    ) {
      for (const letter of arg.slice(1)) flags[shortOutputFlags[letter]] = true;
      continue;
    }
    messageArgs.push(arg);
  }
  return { flags, messageArgs };
}
