# Entrypoints and lifecycle

## Invocation
The package exposes `agentx` and `agentx-setup`. Direct invocation must be detected by comparing the real path of `process.argv[1]` with the module URL; importing the launcher must not start a REPL.

At startup, if a home directory exists, load `$HOME/.agentx` with dotenv (quietly). Environment variables already present remain usable; the runtime must support both `agentx_api_key` and `AGENTX_API_KEY`, preferring the lowercase name.

Flags are handled before the REPL:
- `--help`, `-h`, `-?`: print help and exit 0.
- `--version`, `-v`: print package version and exit 0.
- `--debug`: retain for runtime diagnostics.

On interactive TTY startup, if configuration is absent, ask `AgentX is not configured. Run agentx-setup now? [Y/n] `. Declining continues to normal startup; accepting runs setup and reloads the resulting config. Noninteractive startup does not ask.

## Agent startup
`runAgent({ promptPath, cwd, input, output })`:
1. Load prompt template and optional MCP tools.
2. Apply settings from environment.
3. Discover AGENTS.md instructions.
4. Read `.agentx_responseid` in the launch cwd.
5. Resolve API key or fail with a human-readable error.
6. Create the WebSocket Responses transport.
7. Print startup settings and whether the session is new/resuming.
8. Print saved last user/assistant messages when present.
9. If pending tool calls exist, show the resume menu and resolve them before the normal REPL.
10. Create a readline interface with path completion and enter the prompt loop.

Exit on EOF/AbortError or quit commands after printing usage totals. Startup failures go to stderr and process exit code 1.
