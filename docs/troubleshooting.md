# Troubleshooting

Use these steps to resolve common AgentX issues.

## AgentX does not start

Check that Node.js 26 or later is installed. Run `node --version` to see the installed version.

If you installed AgentX globally, check that the npm global bin directory is in `PATH`. This directory lets your shell find `agentx` and `agentx-setup`.

Run `agentx --help` or `agentx --version` to check the command.

## AgentX reports a missing API key

Set `agentx_api_key` or `AGENTX_API_KEY` in your process environment. You can also run `agentx-setup` and save the key in `~/.agentx`.

The lowercase variable takes priority when both variables have values. Keep the key private.

## Setup does not start

`agentx-setup` needs an interactive terminal. Start it from a terminal window.

## A prompt or MCP file fails to load

Check the reported file path and error. MCP settings use JSON in `~/.agentx.mcp.json`. A missing MCP file is valid.

Run `agentx --check-mcp` to validate MCP settings without connecting to servers.

## Session recovery appears

AgentX can show a recovery menu after an interrupted request or a response ID error. Choose retry, new chain, rollback, or clear based on the work you want to keep.

Rollback restores conversation state only. It does not undo shell commands or other external actions.

Read the [session guide](conversation-state.md) for saved state and recovery behavior.

## A local shell command does not stop

Press Ctrl-C while a direct `!` command runs. This stops the local command and returns to AgentX.

Press Ctrl-T to interrupt a model-requested `shell_call`. This does not stop a direct `!` command.

## Report a local development problem

Run `npm ci`, then `npm test` from the repository root. Include the error output when you report a problem. Remove secrets before you share logs.
