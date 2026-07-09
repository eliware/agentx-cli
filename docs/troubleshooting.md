# Troubleshooting

## AgentX does not start

Check that `agentx_api_key` or `AGENTX_API_KEY` is set in your shell environment. If you installed the package globally, make sure your npm global bin directory is on PATH so `agentx` and `agentx-setup` can be found.
If you want a guided setup, run `agentx-setup` to edit `.env` and inspect the GUI service.

If you only want to confirm the install, use `agentx --help` or `agentx --version`.

If the WebSocket connection closes or hits the service limit, AgentX will reconnect automatically when it can.

## Missing API key

AgentX stops at startup if neither environment variable is set. Export one before launching the CLI, or run `agentx-setup` to save it locally.

## prompt.json cannot be read

If the prompt template is missing or invalid, AgentX prints the file path and the parse/read error. Fix the file and launch again.

## It says AGENTS.md was not found

That means there is no `AGENTS.md` in the current directory or any parent directory. AgentX will continue with a fallback instruction.

## Web GUI looks broken

That is expected for now. The browser UI is still a proof of concept and many flows are incomplete or fail.
Use the CLI if you want the more reliable path. The GUI path is mainly for repository-local use.

## Shell command output looks missing

Remember that lines starting with `>` run locally and are buffered for the next AI request. If you want the output included in the next reply, send a normal message after the command.

## Session seems stale

Remove `.agentx_responseid` or use `/clear`.

If the saved response id is no longer valid, AgentX may automatically start a new chain and tell you. If pending tool calls are saved, you may also be prompted to resume them, retry them, or start a new session.
