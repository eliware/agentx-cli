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
    noMcp: Boolean(flags.noMcp),
    noMcpOutput: quiet || Boolean(flags.noMcpOutput),
    noWebsearch: quiet || Boolean(flags.noWebsearch),
  };
}
