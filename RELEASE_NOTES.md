# AgentX Release Notes

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
