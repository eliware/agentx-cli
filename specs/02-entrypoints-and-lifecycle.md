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

Startup context assembly belongs to `agent/session-bootstrap.mjs`: it merges CLI/runtime flags, resolves session/checkpoint paths, loads prompt and settings, discovers AGENTS.md, restores the saved state, and resolves the API key. Its mirrored tests cover startup selection and error cases. Startup text rendering belongs to `agent/session-presentation.mjs`, which owns quiet-mode filtering and the ordering of startup, saved-message, failure, and paused-goal notices. Its mirrored tests cover rendering decisions; runtime integration tests verify lifecycle ordering and prepared-context wiring without repeating each formatting branch. The runtime is the composition root: it owns process-level client/signal lifetime and orders focused startup, command, request/recovery, and turn-finalization modules; it must not implement their policies inline.

Request-scoped callback construction belongs to `agent/session-request-callbacks.mjs`, which coordinates usage, retry persistence, image inspection, worker usage, and goal callback adapters through injected session state and services. Its mirrored suite owns those callback contracts; runtime tests verify that the callback bundle is wired into each request.

Request failure recovery flow belongs to `agent/session-request-recovery.mjs`: it coordinates transport-retry classification, recovery menus, client recreation, debug retry, new-chain, rollback, clear, and cancellation outcomes using injected actions and mutable request state. Its mirrored tests cover the recovery branches; the runtime applies the returned retry/end/throw control to its prompt loop.

Saving generated images and recording their paths in the pending CLI transcript belong to `agent/session-image-generation.mjs`; it owns success/error presentation and saving updated session state through injected file and terminal services. Its mirrored tests cover save success/failure, while runtime tests cover only callback wiring.

After a response cycle, `agent/session-turn-finalization.mjs` owns in-memory turn-state completion, history/checkpoint persistence, and one-shot session cleanup. It receives persistence and exit actions as dependencies; its mirrored tests cover state transitions and side-effect ordering. The runtime returns to the prompt or exits based on the finalization result.

Session-scoped and global destructive-tool approval prompts belong to `agent/session-confirmation.mjs`, which owns confirmation-cache lookup, interactive choice parsing, and global-cache persistence through injected readline and policy services. Its mirrored tests cover approval decisions; runtime tests cover confirmation wiring into tool execution.

The in-session setup command lifecycle belongs to `agent/session-setup-flow.mjs`: it closes the active REPL before opening setup, recovers from setup errors, reloads prompt/settings, reports completion, and returns a replacement REPL. Its mirrored tests own these lifecycle branches; runtime tests own only command routing.

Interactive rollback selection belongs to `agent/session-rollback-flow.mjs`: it detaches the REPL during the menu, applies and persists a selected checkpoint, handles cancellation/errors, and restores the REPL on every path. Its mirrored tests cover selection and cleanup; runtime tests cover the `/rollback` route only.

1. Prepare the prompt template and optional MCP tools, settings, AGENTS.md instructions, saved session/checkpoint, and API key.
2. Create the official `@eliware/openai` client with its supported Responses transport through the focused AgentX client module, which owns client configuration and Responses diagnostic/error listener binding. AgentX must not create WebSocket objects, frame protocol messages, parse transport events, or implement reconnect/close behavior.
3. Print startup settings and whether the session is new/resuming.
4. Print saved last user/assistant messages when present.
5. For one-shot mode, load only the latest successful checkpoint and use an isolated pending-state file; never resume interactive pending calls, create readline, read stdin, enter raw mode, or open any menu. Otherwise, create the interactive readline interface before resolving pending tool calls, then show the resume menu and resolve them before the normal REPL. This prevents resume-time confirmation prompts from accessing an uninitialized readline binding.
6. Create a readline interface with path completion only for interactive mode and enter the prompt loop.
7. One-shot API failures retry automatically once; a second failure prints the error and exits nonzero. Recognized closed/lifetime WebSocket failures use bounded exponential-backoff reconnects for up to 10 seconds before following normal failure handling. Interactive recovery must honor every explicit `retry` choice without an arbitrary retry limit, while `new-chain` recovery remains bounded to prevent accidental loops. Each manual `retry` or `debug-retry` must close and recreate the Responses client before retrying; preserve the exact pending continuation request only when one exists, otherwise rebuild from the last active user request. `previous_response_not_found` recovery also consumes that single automatic retry and must not loop indefinitely.

Exit on EOF/AbortError or quit commands after printing usage totals. Ctrl-C from recovery menus must restore cooked terminal mode, remove listeners, recreate the REPL interface, and return to the prompt without hanging. Register shared signal handlers for SIGTERM, SIGINT, and SIGHUP; shutdown must cleanly close readline, terminate active workers, and remove handlers without duplicate registration. One-shot failures do not open recovery menus; they go to stderr and process exit code 1. Startup failures go to stderr and process exit code 1.

## Local shell interaction

The REPL owns command parsing and persistence of the pending CLI transcript. A focused local-shell interaction module owns execution of `!` commands, Ctrl-C abort wiring, and temporary readline/raw-terminal lifecycle. It returns the command result to the REPL coordinator, which appends and persists that result. One-shot and non-TTY execution must not enter raw mode or register interactive input listeners. Mirrored tests cover interruption and terminal cleanup; REPL tests cover only command routing and persistence coordination.

Goal command state transitions are owned by `agent/goal-command-state.mjs`: it decides goal creation, status, cancellation, and resume state without performing terminal output or persistence. Iteration, completion, user-question, and iteration-limit callbacks are owned by `agent/goal-callbacks.mjs`, which applies goal persistence and terminal interactions through injected runtime state and I/O. Each module has mirrored focused tests; runtime tests cover only prompt-loop routing and persisted lifecycle integration.

## WebSocket lifetime errors

AgentX must register a Responses transport `error` listener for every client, so transport failures are handled as promise rejections rather than process-level unhandled rejections. If a request fails because the Responses WebSocket reached its server-enforced lifetime or is closed, AgentX must close the stale client, wait with exponential backoff, create a fresh client, and retry without discarding session state. These reconnect attempts are bounded by a 10-second window; after the window expires, interactive sessions enter the recovery menu and one-shot sessions fail normally. Other failures use the existing recovery behavior.

Request failure and recovery-menu retry decisions are owned by `agent/request-recovery.mjs`, a pure state-transition module with mirrored tests. It classifies WebSocket and missing-response failures, applies the one-shot retry and new-chain limits, and maps recovery-menu choices to actions. Request construction, retry execution, recovery-menu interaction, and application of recovery actions belong to a focused request-cycle coordinator with mirrored tests. Turn completion persistence and one-shot cleanup belong to a focused turn-finalization module; the runtime only orders these modules and supplies process/session dependencies.

Parsed internal command routing belongs to `agent/session-command-router.mjs`: it applies goal-command transitions and delegates setup, clear, rollback, usage, and working-directory operations through injected handlers. The router returns whether the prompt loop should continue, exit, or send a transformed user message. Its mirrored tests cover dispatch decisions; command-specific side effects remain in focused setup/rollback/persistence/path modules. Local `!` command behavior remains in `agent/local-shell.mjs`. Prompt reading, terminal mode preparation, Ctrl-T goal interruption, and readline replacement have a focused session-input boundary. Runtime integration tests cover only the lifecycle ordering and wiring among these modules.

The session prompt dispatcher belongs to `agent/session-input-dispatch.mjs`: it classifies blank input, local `!` commands, parsed AgentX commands, and ordinary model messages; it delegates local execution and parsed command policy to their focused modules and returns a prompt-loop action. `agent/session-command-dispatcher.mjs` binds the command router to the focused setup/rollback flows and current session services. Runtime supplies session state accessors and concrete persistence/terminal services. Mirrored tests cover dispatch, command-flow wiring, and transcript persistence without importing the full runtime.

The interactive prompt lifecycle belongs to `agent/session-prompt-loop.mjs`: it reads prompt input and dispatches commands or ordinary messages, delegating each ordinary message to `agent/session-user-turn.mjs`. It receives explicit session state accessors and injected services; it does not create clients, load configuration, or register process signals. Runtime initializes those process/session resources, invokes the prompt loop, and guarantees cleanup. Prompt-loop tests cover action sequencing; individual dispatch, request recovery, and turn state policies remain in their mirrored focused suites.

Per-user-turn orchestration belongs to `agent/session-user-turn.mjs`: it records the user message, prepares request state, invokes the request-cycle coordinator, and delegates completion persistence/one-shot cleanup to turn finalization. It returns whether the prompt loop should continue or exit. Its mirrored tests cover sequencing and recovery outcomes without importing the runtime.

Prompt-read abort/EOF policy belongs to `agent/session-prompt-errors.mjs`: it persists active-goal cancellation, emits the cancellation notice, or delegates ordinary EOF to the usage-summary exit action; unexpected errors propagate unchanged. Runtime invokes the policy around readline input. Readline creation, history preservation, replacement, and close belong to `agent/session-repl.mjs`; raw-mode preparation and Ctrl-T goal cancellation listener lifecycle remain in `agent/session-input.mjs`. Signal-handler registration is process-scoped in `agent/process-lifecycle.mjs`, while per-run readline/client/worker/output restoration belongs to `agent/session-shutdown.mjs`; mirrored tests cover those resource boundaries.

Session worker-usage rendering belongs to `agent/session-worker-usage.mjs`, which filters absent usage and suppressed reports before formatting terminal output. The usage-summary process exit action belongs to `agent/session-exit.mjs`, which prints the final report when enabled, closes the active REPL, and exits successfully. Their mirrored tests cover filtering and exit ordering; runtime only composes these actions into worker and prompt lifecycle callbacks.
