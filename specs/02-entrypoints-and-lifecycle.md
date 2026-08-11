# Entrypoints and lifecycle

## Invocation
The package exposes `agentx` and `agentx-setup`. Direct invocation must be detected by comparing the real path of `process.argv[1]` with the module URL; importing the launcher must not start a REPL.

At startup, if a home directory exists, load `$HOME/.agentx` with dotenv (quietly). Environment variables already present remain usable; the runtime must support both `agentx_api_key` and `AGENTX_API_KEY`, preferring the lowercase name.

Flags are handled before the REPL:
- `--help`, `-h`, `-?`: print help and exit 0.
- `--version`, `-v`: print package version and exit 0.
- `--check-mcp`, `-M`: validate the user-local MCP config shape, HTTPS URLs, labels, and authorization presence without contacting OpenAI or MCP servers; exit 0 when valid or absent, and exit 1 when invalid.
- `--debug`: retain for runtime diagnostics.
- `--confirm`: enable confirmation prompts for model-requested CLI tool calls. Approval is the default; `--yolo` remains a legacy alias.
- `--cwd PATH` (`-C PATH`): run the session with `PATH` as its working directory. Relative paths resolve from the directory where AgentX was launched.
- Output flags are valid in interactive and one-shot/noninteractive modes: `--no-usage` (`-u`), `--no-colors` (`-c`), `--no-timers` (`-t`), `--no-reasoning` (`-r`), `--no-shell-calls` (`-s`), `--no-tool-calls` (`-o`), `--no-mcp` (`-m`), and `--no-websearch` (`-w`). Short output flags may be stacked, such as `-qur`.
- `--quiet` (`-q`) suppresses usage, timers, shell-call deltas, non-shell tool-call deltas, MCP output, and web-search output, while retaining assistant text and reasoning output. `--no-reasoning` additionally suppresses reasoning output. Output flags affect rendering only; they do not change the request payload, reasoning settings, tool execution, or usage accounting.
- Remaining arguments are joined with spaces as a one-shot chat message. `agentx "message"` sends one request, performs tool calls, prints the normal response/usage summary, then exits without opening the REPL or reading stdin.

On interactive TTY startup, if configuration is absent, ask `AgentX is not configured. Run agentx-setup now? [Y/n] `. Declining continues to normal startup; accepting runs setup and reloads the resulting config. Noninteractive startup does not ask.

## Agent startup
`runAgent({ promptPath, cwd, input, output, initialMessage, oneShot })` (when `oneShot` is true, process `initialMessage` once and exit after the normal usage summary):
1. Load prompt template and optional MCP tools.
2. Apply settings from environment.
3. Discover AGENTS.md instructions.
4. Read `.agentx_responseid` in the launch cwd.
5. Resolve API key or fail with a human-readable error.
6. Create the official `@eliware/openai` client with its supported Responses transport. AgentX must not create WebSocket objects, frame protocol messages, parse transport events, or implement reconnect/close behavior.
7. Print startup settings and whether the session is new/resuming.
8. Print saved last user/assistant messages when present.
9. For one-shot mode, load only the latest successful checkpoint and use an isolated pending-state file; never resume interactive pending calls, create readline, read stdin, enter raw mode, or open any menu. Otherwise, create the interactive readline interface before resolving pending tool calls, then show the resume menu and resolve them before the normal REPL. This prevents resume-time confirmation prompts from accessing an uninitialized readline binding.
10. Create a readline interface with path completion only for interactive mode and enter the prompt loop.
11. One-shot API failures retry automatically once; a second failure prints the error and exits nonzero. Interactive recovery must honor every explicit `retry` choice without an arbitrary retry limit, while `new-chain` recovery remains bounded to prevent accidental loops. Each manual `retry` or `debug-retry` must close and recreate the Responses client before retrying; preserve the exact pending continuation request only when one exists, otherwise rebuild from the last active user request. `previous_response_not_found` recovery also consumes that single automatic retry and must not loop indefinitely.

Exit on EOF/AbortError or quit commands after printing usage totals. Ctrl-C from recovery menus must restore cooked terminal mode, remove listeners, recreate the REPL interface, and return to the prompt without hanging. Register shared signal handlers for SIGTERM, SIGINT, and SIGHUP; shutdown must cleanly close readline, terminate active workers, and remove handlers without duplicate registration. One-shot failures do not open recovery menus; they go to stderr and process exit code 1. Startup failures go to stderr and process exit code 1.

## WebSocket lifetime errors

AgentX must register a Responses transport `error` listener for every client, so transport failures are handled as promise rejections rather than process-level unhandled rejections. If a request fails because the Responses WebSocket reached its server-enforced lifetime or is closed, AgentX must close the stale client, create a fresh client, and retry the request once without discarding session state. Other failures use the existing recovery behavior.
