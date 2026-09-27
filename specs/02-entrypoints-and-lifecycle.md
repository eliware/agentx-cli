# Entrypoints and lifecycle

CLI argument tokenization lives in `cli-args.mjs`; output suppression normalization lives in `cli-flags.mjs`; package-version file access and help rendering live in `cli-version.mjs` and `cli-help.mjs`; loading user-local dotenv configuration lives in `env-loader.mjs`. Each has a mirrored focused test suite. Entrypoint and runtime orchestration consume those focused modules without duplicating parser or help-text assertions.

## Invocation

The package exposes `agentx` and `agentx-setup` through `bin/agentx.mjs` and `bin/agentx-setup.mjs`, which delegate to the matching root entrypoints. `agentx-setup --help` (`-h`) prints setup usage without entering the interactive flow; `agentx-setup --version` (`-v`) prints the package version and exits successfully. Direct invocation must be detected by comparing the real path of `process.argv[1]` with the module URL, including the corresponding package `bin/` launcher path; importing the launcher must not start a REPL. This must continue to work when npm or the operating system invokes the package through a symlink.

Entrypoint direct-invocation detection, setup invocation, and setup error/exit handling are tested in the mirrored `tests/agentx-setup.test.mjs`; setup workflow behavior is tested with `src/setup.mjs` and must not duplicate those entrypoint assertions.

At startup, if a home directory exists, load `$HOME/.agentx` with dotenv (quietly). Environment variables already present remain usable; the runtime must support both `agentx_api_key` and `AGENTX_API_KEY`, preferring the lowercase name.

Flags are handled before the REPL:

- `--help`, `-h`, `-?`: print help and exit 0.
- `--version`, `-v`: print package version and exit 0.
- `--check-mcp`, `-K`: validate the user-local MCP config shape, HTTPS URLs, labels, and authorization presence without contacting OpenAI or MCP servers; exit 0 when valid or absent, and exit 1 when invalid.
- `--debug`: retain for runtime diagnostics.
- `--confirm`: enable confirmation prompts for model-requested CLI tool calls. Approval is the default; `--yolo` remains a legacy alias.
- `--cwd PATH` (`-C PATH`): run the session with `PATH` as its working directory. Relative paths resolve from the directory where AgentX was launched.
- Output and tool-selection flags are valid in interactive and one-shot/noninteractive modes: `--no-usage` (`-u`), `--no-colors` (`-c`), `--no-timers` (`-t`), `--no-reasoning` (`-r`), `--no-shell-calls` (`-s`), `--no-tool-calls` (`-o`), `--no-mcp` (`-m`) to disable MCP tool loading, `--no-mcp-output` (`-M`) to suppress MCP rendering while keeping MCP enabled, and `--no-websearch` (`-w`). Short flags may be stacked, such as `-qur`.
- `--quiet` (`-q`) suppresses usage, timers, shell-call deltas, non-shell tool-call deltas, MCP output, and web-search output, while retaining assistant text and reasoning output. `--no-reasoning` additionally suppresses reasoning output. Rendering flags do not change the request payload, reasoning settings, tool execution, or usage accounting; `--no-mcp` changes the request by omitting configured MCP tools. Quiet mode keeps MCP tools loaded and executable.
- Remaining arguments are joined with spaces as a one-shot chat message. `agentx "message"` sends one request, performs tool calls, prints the normal response/usage summary, then exits without opening the REPL or reading stdin.

On interactive TTY startup, if configuration is absent, ask `AgentX is not configured. Run agentx-setup now? [Y/n] `. Declining continues to normal startup; accepting runs setup and reloads the resulting config. Noninteractive startup does not ask.

## Agent startup

`runAgent({ promptPath, cwd, input, output, initialMessage, oneShot })` (when `oneShot` is true, process `initialMessage` once and exit after the normal usage summary):

1. Load prompt template and optional MCP tools.
2. Apply settings from environment.
3. Discover AGENTS.md instructions.
4. Read `.agentx_responseid` in the launch cwd.
5. Resolve API key or fail with a human-readable error.
6. Create the official `@eliware/openai` client with its supported Responses transport through the focused AgentX client module, which owns client configuration and Responses diagnostic/error listener binding. AgentX must not create WebSocket objects, frame protocol messages, parse transport events, or implement reconnect/close behavior.
7. Print startup settings and whether the session is new/resuming.
8. Print saved last user/assistant messages when present.
9. For one-shot mode, load only the latest successful checkpoint and use an isolated pending-state file; never resume interactive pending calls, create readline, read stdin, enter raw mode, or open any menu. Otherwise, create the interactive readline interface before resolving pending tool calls, then show the resume menu and resolve them before the normal REPL. This prevents resume-time confirmation prompts from accessing an uninitialized readline binding.
10. Create a readline interface with path completion only for interactive mode and enter the prompt loop.
11. One-shot API failures retry automatically once; a second failure prints the error and exits nonzero. Recognized closed/lifetime WebSocket failures use bounded exponential-backoff reconnects for up to 10 seconds before following normal failure handling. Interactive recovery must honor every explicit `retry` choice without an arbitrary retry limit, while `new-chain` recovery remains bounded to prevent accidental loops. Each manual `retry` or `debug-retry` must close and recreate the Responses client before retrying; preserve the exact pending continuation request only when one exists, otherwise rebuild from the last active user request. `previous_response_not_found` recovery also consumes that single automatic retry and must not loop indefinitely.

Exit on EOF/AbortError or quit commands after printing usage totals. Ctrl-C from recovery menus must restore cooked terminal mode, remove listeners, recreate the REPL interface, and return to the prompt without hanging. Register shared signal handlers for SIGTERM, SIGINT, and SIGHUP; shutdown must cleanly close readline, terminate active workers, and remove handlers without duplicate registration. One-shot failures do not open recovery menus; they go to stderr and process exit code 1. Startup failures go to stderr and process exit code 1.

## Local shell interaction

The REPL owns command parsing and persistence of the pending CLI transcript. A focused local-shell interaction module owns execution of `!` commands, Ctrl-C abort wiring, and temporary readline/raw-terminal lifecycle. It returns the command result to the REPL coordinator, which appends and persists that result. One-shot and non-TTY execution must not enter raw mode or register interactive input listeners. Mirrored tests cover interruption and terminal cleanup; REPL tests cover only command routing and persistence coordination.

Goal command state transitions are owned by `agent/goal-command-state.mjs`: it decides goal creation, status, cancellation, and resume state without performing terminal output or persistence. Iteration, completion, user-question, and iteration-limit callbacks are owned by `agent/goal-callbacks.mjs`, which applies goal persistence and terminal interactions through injected runtime state and I/O. Each module has mirrored focused tests; runtime tests cover only prompt-loop routing and persisted lifecycle integration.

## WebSocket lifetime errors

AgentX must register a Responses transport `error` listener for every client, so transport failures are handled as promise rejections rather than process-level unhandled rejections. If a request fails because the Responses WebSocket reached its server-enforced lifetime or is closed, AgentX must close the stale client, wait with exponential backoff, create a fresh client, and retry without discarding session state. These reconnect attempts are bounded by a 10-second window; after the window expires, interactive sessions enter the recovery menu and one-shot sessions fail normally. Other failures use the existing recovery behavior.

Request failure and recovery-menu retry decisions are owned by `agent/request-recovery.mjs`, a pure state-transition module with mirrored tests. It classifies WebSocket and missing-response failures, applies the one-shot retry and new-chain limits, and maps recovery-menu choices to actions. The runtime remains responsible for client recreation, persistence, prompts, rollback, and applying the selected action.
