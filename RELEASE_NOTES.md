# AgentX Release Notes

## 1.1.13 - Live status updates and session/runtime polish

Deltas from 1.1.12:

- Added live terminal status lines for reasoning and tool execution, with elapsed time and spinner updates.
- Improved streamed Responses handling so status output clears cleanly when assistant text or tool output starts.
- Tightened shell-call parsing and output normalization across function-call and structured shell-call paths.
- Expanded websocket debug logging and frame formatting for OpenAI transport diagnostics.
- Refined session persistence and usage reporting during tool-heavy turns.
- Updated tests to cover the new status, websocket, and session behaviors.

## 1.1.12 - WebSocket Responses transport and parallel shell calls

Deltas from 1.1.11:

- Switched the agent runtime to the direct `openai` package and added a WebSocket-based Responses transport.
- Added reconnect and retry handling for websocket transport errors and response continuation.
- Reworked live streaming output to show streamed function-call arguments and command summaries.
- Replaced the old shell tool schema with `shell_call`, supporting parallel command groups, per-group working directories, and output limits.
- Removed the terminal thinking spinner and cleaned up redundant shell-command echoing.
- Updated prompt metadata, docs, and regression coverage for the new transport and shell flow.

## 1.1.11 - CLI flags, startup hardening, and docs refresh

Deltas from 1.1.10:

- Added `--help/-h/-?`, `--version/-v`, and `--debug` startup flags.
- Added clear startup errors for missing API keys and unreadable prompt templates.
- Made API key lookup prefer `agentx_api_key` and fall back to `AGENTX_API_KEY`.
- Refactored request-building and session-prep logic into `src/agent-flow.mjs`.
- Expanded the user docs under `docs/` with quickstart, command reference, examples, session state, and troubleshooting guides.
- Added regression coverage for CLI flags, request shaping, Responses API compatibility, and smoke-startup behavior.

## 1.1.10 - Usage accounting fixes for tool retriggers

Deltas from 1.1.9:

- Fixed per-turn usage accounting so shell tool retriggers are counted in the persisted session totals.
- Restored usage status output during tool continuations so tool-heavy turns report accurate token totals.
- Added regression coverage for usage accumulation and tool-retrigger reporting.

## 1.1.9 - Server-side compaction and shell tool cleanup

Deltas from 1.1.8:

- Enabled server-side Responses API compaction via `context_management` in `prompt.json`.
- Removed the old manual `/compact` flow and the local transcript-summarization fallback.
- Simplified the tool set to `shell_call` only; file tools were removed from the prompt/runtime.
- Reworked shell handling around structured `shell_call` / `shell_call_output` responses, including multiple commands per call, timeouts, and output limits.
- Added the terminal “Thinking...” indicator while waiting on OpenAI responses and tool execution.
- Allowed parallel tool-call execution while preserving tool output order.
- Updated docs (`README.md`, `AGENTS.md`) to reflect server-side compaction, `shell_call` only, and the lack of a manual `/compact` command.
- Cleaned up package metadata and test scripts: refreshed the description/keywords, and made `npm test` run coverage by default.

## 1.1.8 - Session transcript persistence and local shell passthrough

Deltas from 1.1.7:

- Added leading `>` shell command passthrough that runs locally and buffers output into the next AI request.
- Persisted last user/assistant messages and pending CLI transcript in `.agentx_responseid`, with legacy-state normalization on load/save.
- Restored and printed the last exchanged messages when resuming a saved session.
- Expanded README docs and test coverage for session restore, shell passthrough, and state migration.

## 1.1.7 - Request preservation and coverage hardening

Deltas from 1.1.6:

- Preserved top-level Responses API request fields across session resumes and tool-call continuations.
- Improved direct-invocation detection so the REPL only starts when launched as the main entrypoint.
- Added fallback handling for prompt building, CLI defaults, and path-completion edge cases.
- Expanded coverage-focused tests and added a dedicated `coverage` npm script.

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

## 1.1.3 - Version bump

Deltas from 1.1.2:

- No functional code changes.
- Package metadata and lockfile version updates only.

## 1.1.4 - Shell agent improvements

Deltas from 1.1.3:

- Improved shell-agent handling in `src/shell-agents.mjs`.
- Updated shell test coverage in `tests/shell.test.mjs`.
- Package metadata and lockfile version updates.

## 1.1.5 - Session state and shell command expansion

Deltas from 1.1.4:

- Added full session-state management in `src/agent-session.mjs`.
- Expanded `src/agent.mjs` to support persisted session usage tracking and resume behavior.
- Added support for shell commands in `src/shell-commands.mjs`.
- Added and expanded tests for session management and shell behavior.
- Added usage aggregation and per-turn reporting.

## 1.1.6 - File tools

Deltas from 1.1.5:

- Added file tool support in `src/tool-files.mjs`.
- Added corresponding test coverage in `tests/tool-files.test.mjs`.
- Package metadata and lockfile version updates.
