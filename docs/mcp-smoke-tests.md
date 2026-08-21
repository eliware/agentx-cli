# MCP smoke tests

Run these checks from the AgentX repository so the local entrypoint and current working directory are unambiguous. The commands use the configured `~/.agentx.mcp.json` file and do not include credentials on the command line. On Windows, use `node agentx.mjs` from the repository root and use PowerShell line continuation with a backtick instead of `\`.

## Confirm MCP is disabled

```bash
node agentx.mjs --no-mcp --no-usage --no-timers --no-colors \
  "Use an MCP tool if one is available. If no MCP tools are available, reply exactly: MCP disabled."
```

Expected result: `MCP disabled.` and no MCP call.

## Confirm MCP execution with output suppressed

Temporarily set the target server's `enabled` field to `true` in `~/.agentx.mcp.json`, then run:

```bash
node agentx.mjs --no-mcp-output --no-usage --no-timers --no-colors \
  "Use the Puppeteer MCP tool to open https://example.com and report the page title."
```

Expected result: `Example Domain`, without streamed MCP call details. Restore `enabled: false` when finished if MCP should remain disabled by default.

## Inspect configuration without contacting servers

```bash
node agentx.mjs --check-mcp
```

This validates JSON shape, HTTPS URLs, labels, and authorization presence only. Disabled entries remain visible to this configuration check so they can be re-enabled later.
