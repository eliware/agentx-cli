# AgentX Release Notes

## 1.5.10 - Autonomous goal mode

- Added autonomous `/goal` workflows with status, cancellation, blocking, and resumable session state.
- Added `goal_update` goal-state tool contract with iteration limits and verification evidence.
- Added focused regression coverage for goal execution and lifecycle behavior.
- Clarified goal commands and workflows in the user documentation.
- Verified with 100% test coverage and clean lint results.


## 1.5.9 - Delegated worker role clarity

- Added a concise developer instruction for one-shot delegated workers.
- Prevented delegated workers from spawning agents, orchestrating work, or broadening task scope.
- Added specification and regression coverage for the worker role instruction.
- Verified with 100% test coverage and clean lint results.


## 1.5.8 - One-shot worker context output

- Preserved inherited checkpoint context for spawned one-shot workers while suppressing human-oriented session recap output.
- Added specification and regression coverage for worker session context behavior.
- Verified with 100% test coverage and clean lint results.


## 1.5.7 - Recovery and validation hardening

- Allowed repeated explicit interactive recovery retries while keeping new-chain recovery bounded.
- Hardened worker, tool, shell, filesystem, and streamed-response failure handling.
- Added lifecycle, entrypoint, recovery, and validation regression coverage.
- Improved configuration, output-status, and release-validation documentation.
- Verified with 100% test coverage, clean lint, and successful package smoke checks.


## 1.5.6 - Convention alignment

- Removed the stale `.agentx.example` package-file entry.
- Added the standard `npm pack --dry-run` script.
- Added README security and configuration guidance.
- Aligned test and coverage scripts with Eliware conventions.
- Verified with 100% test coverage and clean lint results.

## 1.5.5 - Dependency refresh

- Updated `@eliware/common` to 1.1.7.
- Updated `@eliware/openai` to 1.1.11.
- Refreshed transitive lockfile dependencies.
- Moved README badges to the top of the document.
- Verified with 100% test coverage and clean lint results.

## 1.5.4 - Responses WebSocket lifetime recovery

- Registered a transport error listener to prevent unhandled WebSocket rejection noise.
- Recreated expired or closed Responses WebSocket clients and retried the request once without discarding session state.
- Added lifecycle specification coverage for WebSocket lifetime failures.
- Verified with 100% test coverage and clean lint results.

## 1.5.3 - Interactive shell and recovery reliability

- Removed automatic timeouts from interactive `!` commands.
- Added Ctrl-C handling for local `!` commands: terminate the command/process group and return to AgentX without exiting.
- Kept Ctrl-T separate for model-requested `shell_call` interruption, with explicit guidance to stop execution, avoid retries, and report current status.
- Fixed stale failed tool-continuation retries being silently replayed as the next user message.
- Improved OpenAI error formatting by unwrapping JSON-encoded API errors and showing concise metadata instead of raw JSON.
- Preserved readline history across shell execution, interruption, setup, and recovery interface replacement; Up/Down, Home/End, and arrow editing remain available.
- Updated specifications, README, user documentation, release notes, and regression coverage.
- Verified with 100% test coverage and clean lint results.

## 1.5.2 - Shared libraries and official OpenAI client

- Replaced AgentX’s custom OpenAI WebSocket transport, framing, reconnect, and lifecycle code with `@eliware/openai`.
- Removed the obsolete direct transport implementation and its duplicated tests; OpenAI transport behavior and mocks are now owned by Eliware’s shared library.
- Adopted `@eliware/common` signal registration and shared path utilities.
- Improved shutdown handling, worker cleanup, path handling, setup, CLI, and confirmation integration.
- Updated architecture, lifecycle, and testing specifications to define the shared-library boundaries.
- Normalized package metadata, lockfile, README, test/lint scripts, and CI workflow dispatch support.
- Verified with 100% test coverage and clean lint results.

## 1.5.1 - Worker status prompt schema

- Updated the `agent_status` tool schema to expose byte-based output limits and pagination.

## 1.5.0 - Byte-bounded worker status output

- Changed `agent_status` output pagination from lines to bytes.
- Default output is the last 2048 bytes; callers may request up to 8192 bytes with `output_bytes` and `output_offset`.
- Updated regex search handling, specifications, documentation, and regression tests.

## 1.4.9 - Agent status and Windows path improvements

- Prioritized `HOME` over `USERPROFILE` for Windows home-directory resolution, including Git Bash and CI environments.
- Improved `agent_status` to return the last 10 log lines by default instead of a large output tail.
- Added paginated log viewing with `output_lines` and `output_offset`.
- Added regex searching across retained worker output with `search`.
- Updated specifications, prompt schemas, documentation, and regression tests.

## 1.4.8 - Resume readline hotfix

- Fixed resume-time confirmation prompts accessing an uninitialized readline interface.
- Prevented interrupted tool continuations from failing with `Cannot access 'rl' before initialization`.
- Added lifecycle specification coverage for readline initialization ordering.

## 1.4.7 - Worker hardening and recovery

- Added worker permissions (`read`, `write`, `execute`), optional debug mode, and `cancel_agent`.
- Limited delegation to 3 workers, disabled nested spawning, capped worker output at 1 MB, and added a 10-minute timeout.
- Added graceful worker cancellation and shutdown with SIGTERM-to-SIGKILL escalation.
- Hardened shell execution by enforcing worker permissions and terminating POSIX process groups on timeout or interruption.
- Made one-shot mode strictly noninteractive, with isolated state cleanup and improved retry/recovery for tool continuations.
- Improved Ctrl-T interruption and readline stability after shell/tool execution.
- Updated prompts, specifications, documentation, examples, and regression tests.

## 1.4.6 - Parallel worker delegation

- Added asynchronous `spawn_agent`, `agent_status`, and `cancel_agent` tools for delegating up to 3 independent tasks.
- Workers run as separate AgentX processes with independent conversations, shared current working directory, with automatic approval by default.
- Added non-blocking worker status polling with partial output, line counts, elapsed time, usage, and optional wait/timeout behavior.
- Made tool confirmation opt-in via `--confirm`; `--yolo` remains a legacy alias.
- Added prompt, documentation, specification, and regression-test coverage for worker delegation.

## 1.4.5 - Readline state preservation

- Fixed duplicate input echo and broken Up/Down command history after interactive shell execution.
- Paused and resumed the readline interface while Ctrl-T raw-mode handling owns terminal input.
- Added terminal UX specification coverage; lint and tests pass.

## 1.4.3 - Terminal status and command interruption

- Changed one-shot/non-interactive status output to disable live refresh timers and print one line per state transition, followed by the final transaction summary.
- Added interactive Ctrl-T interruption for active shell commands, with timeout outcomes and model-visible user interruption notes.
- Added specifications and regression coverage for both behaviors.

## 1.4.2 - Safe one-shot execution and tool-call deduplication

- Added positional one-shot CLI requests: `agentx "message"` performs the request, prints the response and usage summary, then exits.
- Added `--yolo` for explicitly bypassing model-requested CLI confirmation in interactive and one-shot modes.
- Added yes/no/session/global confirmation policy for state-changing CLI tool calls.
- Added isolated one-shot pending state and shared successful checkpoints, allowing concurrent subtasks in one directory without corrupting the interactive session.
- Hardened interrupted tool-call recovery, execution journaling, transport admission, and per-turn deduplication.
- Added focused regression coverage, smoke tests, documentation, and diagnostics for duplicate execution and token/context bloat.
- Reached 100% statements, branches, functions, and lines coverage across the repository.

## 1.4.1 - Recovery diagnostics and failure cleanup

- Added bounded OpenAI/WebSocket failure diagnostics to recovery menus, including error code/type, status, parameter, request ID, and cause when available.
- Fixed failed streamed requests leaving live status refresh timers active over recovery prompts.
- Preserved transport error metadata for more actionable retry and recovery decisions.
- Added regression coverage and CI lint validation.

## 1.4.0 - Cumulative rollup

- Evolved from the initial Responses API CLI into a persistent, cross-platform terminal agent with cwd-aware prompts, commands, completion, usage reporting, and `AGENTS.md` discovery.
- Added session persistence/resume, shell and file tools, structured parallel `shell_call` execution, server-side compaction, local shell passthrough, and interrupted-session recovery.
- Added and later removed the experimental web GUI; introduced `agentx-setup`, user-level `~/.agentx` configuration, npm packaging, service helpers, publish automation, and cross-platform support.
- Added configurable models/settings, pricing, live status and web-search output, debug tooling, optional MCP servers, streamed tool/reasoning display, and comprehensive specifications.
- Hardened setup, terminal handling, WebSocket transport/reconnects, prompt/config loading, tests, and linting.
- Added bounded API/WebSocket recovery, successful-response checkpoints, and `/rollback` without automatically undoing external side effects.

## 1.3.10 - Recovery and rollback

- Added bounded API/WebSocket error recovery without terminating the REPL.
- Added `/rollback` for restoring successful response checkpoints.
- Persisted bounded checkpoint history and failed-response state.

## 1.3.9 - WebSocket reconnect robustness

- Prevented duplicate reconnects when a WebSocket emits both error and close events.
- Ignored stale events from replaced sockets so they cannot affect the active connection or request.
- Added regression coverage for stale socket events and duplicate reconnect handling.

## 1.3.8 - direct shell command prefix update

- Changed direct local shell commands from the `>` prefix to `!`.
- Direct commands continue streaming stdout and stderr to the console and buffering both for the next AI request.
- Updated the CLI help, README, command docs, examples, specification, and regression tests.

## 1.3.7 - setup persistence fix

- Fixed setup to load persisted settings before applying defaults.
- Setup now displays saved settings and persists explicit selection of the default model.
- Added specification updates and regression coverage for persisted model settings.

## 1.3.6 - usage pricing and command documentation

- Updated model usage pricing for Luna and Terra.
- Added long-context pricing above 272,000 input tokens: 2x input/cache and 1.5x output.
- Updated `/usage` warnings, specifications, and regression tests.
- Clarified `clear`, `/clear`, and `>clear` behavior in the README and command docs.

## 1.3.5 - runtime robustness and terminal fixes

- Fixed tab completion after changing directories with `cd`; completion now reads the active cwd without adding duplicate readline listeners.
- Added graceful WebSocket shutdown with a timeout fallback, plus improved handling of connectivity failures and reconnectable closes.
- Skipped symlink-loop entries during `AGENTS.md` discovery instead of failing startup.
- Reloaded settings automatically after `/setup`, with setup errors returned to the REPL instead of terminating it.
- Trimmed internal commands, consolidated `clear` handling, and improved `cd` error messages.
- Compact transaction-completion logs by omitting empty fields.

## 1.3.4 - reconstruction specifications and prompt guidance

- Added normative reconstruction specifications covering architecture, lifecycle, configuration, prompts, REPL behavior, Responses API/tool execution, persistence, terminal UX, platform support, errors, and testing.
- Added a specifications README with the recommended reading order and compatibility guidance.
- Removed the unused AGENTS placeholder from `prompt.json`.
- Added concise-output guidance to the generated developer prompt.
- Expanded prompt tests and fixed a status-line assertion typo.

## 1.3.3 - MCP configuration and streaming fixes

- Moved optional MCP configuration to `~/.agentx.mcp.json` with home-directory fallback support.
- Improved streamed status-line cleanup so final responses and tool output are preserved.
- Refined MCP call, reasoning-summary, and streamed argument display behavior.
- Enhanced the setup screen with version, install path, configuration path, and MCP configuration details.
- Added regression coverage for streaming transitions, setup fallbacks, and configuration-path handling.

## 1.3.2 - MCP configuration and streaming support

- Added optional local `.agentx.mcp.json` configuration, with support for merging MCP tools into the prompt template.
- Added `.agentx.mcp.json.example` and ignored local MCP configuration files.
- Added live MCP call and argument streaming with cyan terminal output.
- Improved `--debug` output filtering for reasoning and MCP streaming events.
- Upgraded `string-width` to 8.2.2 and refreshed the lockfile.
- Added regression coverage for MCP configuration loading, streaming behavior, debug output, and display formatting.

## 1.3.1 - setup and runtime improvements

- Removed MCP server configuration from the setup flow and runtime settings.
- Improved interactive `/setup` menus with numbered choices, arrow-key navigation, current-value indicators, and safer terminal handling.
- Added startup output showing the active model, reasoning, verbosity, and compaction settings.
- Fixed readline cleanup when reloading settings through `/setup`.
- Improved configuration-file persistence and response-content handling for missing content.
- Updated prompt configuration, command documentation, example settings, and regression coverage.

## 1.3.0 - streamlined CLI and configurable setup

- Removed the experimental web GUI, including its server, frontend, authentication, systemd service, assets, build tooling, dependencies, and tests.
- Added first-run setup prompting and an in-session `/setup` command for API key, model, reasoning, output, compaction, and MCP settings.
- Added configurable GPT-5.6 model pricing and high-context pricing warnings to `/usage`.
- Improved `AGENTS.md` discovery documentation and session/prompt configuration handling.
- Simplified the setup flow, package dependencies, README, and user documentation around the terminal CLI.
- Reworked regression coverage for the CLI, setup, settings, usage, and session behavior.

## 1.2.9 - user-level configuration

- Moved persisted AgentX configuration from the project-local `.env` file to `~/.agentx`.
- Updated the CLI, setup helper, and Linux GUI service to load and manage the user-level configuration.
- Renamed the packaged configuration example to `.agentx.example` so global npm upgrades do not overwrite user settings.
- Updated documentation and regression tests for the new configuration path.

## 1.2.8 - model, prompt, and usage updates

- Updated the default model configuration and enabled programmatic tool calling.
- Lowered the server-side compaction threshold and refined reasoning/tool settings.
- Simplified the CLI prompt to show the user, short hostname, working directory, and `#` marker.
- Updated usage pricing for input, cached, and output tokens.
- Adjusted regression tests for the new prompt formatting and usage totals.

## 1.2.7 - lint tooling and cleanup

- Added an `npm run lint` command powered by `oxlint` and updated package metadata.
- Cleaned up unused imports, parameters, and helper code to satisfy the new lint pass.
- Adjusted setup, tool-dispatch, and frontend code paths for the cleanup.
- Updated regression tests to match the streamlined output and websocket payload handling.

## 1.2.6 - live web search status and debug cleanup

- Suppressed live status lines while `--debug` is enabled so raw websocket output stays readable.
- Added live web search event handling with paused/resumed status updates and pink web-search progress/completion lines.
- Updated CLI help and docs to describe the new debug behavior.
- Bumped GitHub Actions workflow actions to the latest checkout and setup-node major versions.
- Expanded regression coverage for debug quiet mode and web-search live streaming.

## 1.2.5 - setup testability and cross-platform cleanup

- Refactored the `agentx-setup` interactive flow to accept injected stdin/stdout streams instead of relying on process globals.
- Cleaned up setup rendering and service install/repair helpers around a shared install root.
- Reworked the setup-flow tests to use a fake terminal, which removed brittle TTY and stdout monkeypatching.
- Noted the repository expectation that tests stay cross-platform friendly on Linux, Windows, and GitHub Actions.

## 1.2.4 - frontend and setup robustness fixes

- Hardened the frontend storage, DOM, transcript, and view helpers for missing browser APIs and empty state inputs.
- Simplified credential and session storage loading so invalid or absent storage cleanly returns null.
- Exposed additional setup internals and tightened the setup entrypoint behavior.
- Expanded regression coverage for auth tokens, setup flow, and frontend edge cases.

## 1.2.3 - GitHub Actions publish test fix

- Updated the runtime test to use the checkout path instead of a local /opt path so the new GitHub Actions workflow can run `npm test` and publish to npm successfully.

## 1.2.2 - setup workflow and release automation

- Added the new `agentx-setup` interactive setup tool for editing `.env` values and managing the GUI service.
- Added systemd service install, repair, uninstall, start/stop, enable/disable, and status helpers for `agentx-gui.service`.
- Updated package metadata for the `agentx-cli` name, npm bin entry, and published file list.
- Added a tag-triggered GitHub Actions publish workflow and expanded setup regression coverage.

## 1.2.1 - shell runtime and frontend cleanup

- Reworked shell execution around streaming launcher processes and sequential command steps inside each `shell_call`.
- Simplified shell/tool dispatch for the current structured `shell_call` shape and updated live event handling.
- Split the browser frontend into focused transcript, view, and style modules.
- Expanded regression coverage for the new shell, transcript, and frontend helpers.

## 1.2.0 - Web GUI proof of concept

- Added a browser-based web GUI and local Express/WebSocket server mode for AgentX.
- The GUI is only a proof of concept right now: lots of things are broken, some flows are incomplete, and it is not ready to rely on yet.
- Added browser-session, auth-token, and Linux auth plumbing to support the new web path.
- Added frontend build tooling, static assets, and a bundled `public/dist/` output.
- Expanded tests and docs around the web GUI and session plumbing.

## 1.1.15 - Windows-aware platform support and CLI packaging

- Added cross-platform platform helpers for home-directory lookup, prompt identity, shell launcher selection, and display-path normalization.
- Made `cd`, path completion, prompt formatting, and shell execution work across POSIX and Windows path conventions.
- Added a `bin` mapping in `package.json` so the installed package exposes the `agentx` CLI.
- Added Windows support docs and refreshed startup/environment guidance for the no-`.env` workflow.
- Expanded tests around platform handling, path completion, shell launchers, and resume behavior.

## 1.1.14 - Interrupted-session resume and shell execution upgrades

- Added a startup resume menu for sessions with pending tool calls, including auto-resume, retry-hint, interruption notice, and new-session paths.
- Persisted pending tool calls in session state so interrupted turns can be resumed safely after restart.
- Reworked shell-call execution to support sequential commands inside parallel groups, with per-group cwd, timeout, and output-limit controls.
- Improved live status output, completion reporting, and usage formatting during streamed turns.
- Expanded docs and regression coverage for resume flows, session-state persistence, shell dispatch, and path completion.

## 1.1.13 - Live status updates and session/runtime polish

- Added live terminal status lines for reasoning and tool execution, with elapsed time and spinner updates.
- Improved streamed Responses handling so status output clears cleanly when assistant text or tool output starts.
- Tightened shell-call parsing and output normalization across function-call and structured shell-call paths.
- Expanded websocket debug logging and frame formatting for OpenAI transport diagnostics.
- Refined session persistence and usage reporting during tool-heavy turns.
- Updated tests to cover the new status, websocket, and session behaviors.

## 1.1.12 - WebSocket Responses transport and parallel shell calls

- Switched the agent runtime to the direct `openai` package and added a WebSocket-based Responses transport.
- Added reconnect and retry handling for websocket transport errors and response continuation.
- Reworked live streaming output to show streamed function-call arguments and command summaries.
- Replaced the old shell tool schema with `shell_call`, supporting parallel command groups, per-group working directories, and output limits.
- Removed the terminal thinking spinner and cleaned up redundant shell-command echoing.
- Updated prompt metadata, docs, and regression coverage for the new transport and shell flow.

## 1.1.11 - CLI flags, startup hardening, and docs refresh

- Added `--help/-h/-?`, `--version/-v`, and `--debug` startup flags.
- Added clear startup errors for missing API keys and unreadable prompt templates.
- Made API key lookup prefer `agentx_api_key` and fall back to `AGENTX_API_KEY`.
- Refactored request-building and session-prep logic into `src/agent-flow.mjs`.
- Expanded the user docs under `docs/` with quickstart, command reference, examples, session state, and troubleshooting guides.
- Added regression coverage for CLI flags, request shaping, Responses API compatibility, and smoke-startup behavior.

## 1.1.10 - Usage accounting fixes for tool retriggers

- Fixed per-turn usage accounting so shell tool retriggers are counted in the persisted session totals.
- Restored usage status output during tool continuations so tool-heavy turns report accurate token totals.
- Added regression coverage for usage accumulation and tool-retrigger reporting.

## 1.1.9 - Server-side compaction and shell tool cleanup

- Enabled server-side Responses API compaction via `context_management` in `prompt.json`.
- Removed the old manual `/compact` flow and the local transcript-summarization fallback.
- Simplified the tool set to `shell_call` only; file tools were removed from the prompt/runtime.
- Reworked shell handling around structured `shell_call` / `shell_call_output` responses, including multiple commands per call, timeouts, and output limits.
- Added the terminal “Thinking...” indicator while waiting on OpenAI responses and tool execution.
- Allowed parallel tool-call execution while preserving tool output order.
- Updated docs (`README.md`, `AGENTS.md`) to reflect server-side compaction, `shell_call` only, and the lack of a manual `/compact` command.
- Cleaned up package metadata and test scripts: refreshed the description/keywords, and made `npm test` run coverage by default.

## 1.1.8 - Session transcript persistence and local shell passthrough

- Added leading `>` shell command passthrough that runs locally and buffers output into the next AI request.
- Persisted last user/assistant messages and pending CLI transcript in `.agentx_responseid`, with legacy-state normalization on load/save.
- Restored and printed the last exchanged messages when resuming a saved session.
- Expanded README docs and test coverage for session restore, shell passthrough, and state migration.

## 1.1.7 - Request preservation and coverage hardening

- Preserved top-level Responses API request fields across session resumes and tool-call continuations.
- Improved direct-invocation detection so the REPL only starts when launched as the main entrypoint.
- Added fallback handling for prompt building, CLI defaults, and path-completion edge cases.
- Expanded coverage-focused tests and added a dedicated `coverage` npm script.

## 1.1.6 - File tools

- Added file tool support in `src/tool-files.mjs`.
- Added corresponding test coverage in `tests/tool-files.test.mjs`.
- Package metadata and lockfile version updates.

## 1.1.5 - Session state and shell command expansion

- Added full session-state management in `src/agent-session.mjs`.
- Expanded `src/agent.mjs` to support persisted session usage tracking and resume behavior.
- Added support for shell commands in `src/shell-commands.mjs`.
- Added and expanded tests for session management and shell behavior.
- Added usage aggregation and per-turn reporting.

## 1.1.4 - Shell agent improvements

- Improved shell-agent handling in `src/shell-agents.mjs`.
- Updated shell test coverage in `tests/shell.test.mjs`.
- Package metadata and lockfile version updates.

## 1.1.3 - Version bump

- No functional code changes.
- Package metadata and lockfile version updates only.

## 1.1.2 - Initial release baseline

Initial capabilities present in the 1.1.2 baseline:

- CLI agent entrypoint wired through `agentx.mjs` and `src/agent.mjs`.
- OpenAI Responses API session flow with persisted response IDs for continuity.
- Session resume on startup when `.agentx_responseid` exists.
- Interactive REPL behavior with prompt that tracks the current working directory.
- Internal command handling for:
  - `clear` to clear the terminal display.
  - `/clear` to clear stored session state and start a new session.
  - `/exit` and `exit` to quit.
  - `/quit` and `quit` to quit.
  - `cd` to change the working directory internally.
  - `/usage` to display usage totals.
- CWD-aware path completion.
- Agent instructions loaded from `AGENTS.md` in the current directory and parent directories.
- Working-directory context included in the agent prompt.
- Response text extraction and usage reporting.
- Terminal output wrapping and prompt formatting.

