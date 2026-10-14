# MCP checks

Run these checks from the AgentX repository. They use the MCP file in your home directory.

## Check the configuration file

Run this command to check the file without contacting a server:

```sh
node bin/agentx.mjs --check-mcp
```

AgentX checks JSON syntax, required fields, HTTPS URLs, labels, and authorization presence. It does not validate credentials with a server.

## Check that MCP tools are disabled

Run one request with MCP tools omitted:

```sh
node bin/agentx.mjs --no-mcp --no-usage --no-timers --no-colors "Use an MCP tool if one is available. If no MCP tools are available, reply exactly: MCP disabled."
```

Expected result: AgentX replies `MCP disabled.` and does not call an MCP tool.

## Check output suppression

Set an MCP server's `enabled` value to `true` in `~/.agentx.mcp.json`. Then run:

```sh
node bin/agentx.mjs --no-mcp-output --no-usage --no-timers --no-colors "Use the configured browser MCP tool to open https://example.com and report the page title."
```

Expected result: AgentX reports `Example Domain` without MCP call details. This check requires a configured browser server and valid authorization.

Set `enabled` to `false` when you want to disable that server again.

## Windows

Run each command on one line in PowerShell. Start the command from the repository root.
