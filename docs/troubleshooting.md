# Troubleshooting

## AgentX does not start

Check that you are running the entrypoint directly and that `agentx_api_key` is set in your shell environment.

If you only want to confirm the install, use `agentx --help` or `agentx --version`.

## It says AGENTS.md was not found

That means there is no `AGENTS.md` in the current directory or any parent directory. AgentX will continue with a fallback instruction.

## Shell command output looks missing

Remember that lines starting with `>` run locally and are buffered for the next AI request. If you want the output included in the next reply, send a normal message after the command.

## Session seems stale

Remove `.agentx_responseid` or use `/clear`.
