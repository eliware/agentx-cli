# Troubleshooting

## AgentX does not start

Check that `agentx_api_key` or `AGENTX_API_KEY` is set in your shell
environment. If installed globally, make sure the npm global bin directory is
on PATH so `agentx` and `agentx-setup` can be found. For guided setup, run
`agentx-setup`.

If you only want to confirm the install, use `agentx --help` or
`agentx --version`.

## Missing API key

AgentX stops at startup if neither environment variable is set. Export one
before launching the CLI, or run `agentx-setup` to save it locally.

## Prompt or MCP configuration errors

If a prompt template is missing or invalid, fix the reported file and parse
error. If using MCP, verify that the optional `.agentx.mcp.json` file contains
valid JSON; a missing file is allowed.

## Other runtime issues

Consult the detailed command, session, and configuration pages linked from the
documentation index. Run `npm ci`, then `npm test` when diagnosing a local
development checkout.
