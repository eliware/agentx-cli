# Agent Instructions

## Project
- This repository contains `AgentX`, a lightweight terminal chat agent.
- The entrypoint is [`agentx.mjs`](./agentx.mjs), which wires into the implementation under [`src/`](./src).

## Working Rules
- Prefer small, focused changes.
- Keep the codebase ESM-only.
- Preserve the interactive CLI behavior unless the user asks otherwise.
- The launchers load `.env` when present, but the app still reads `agentx_api_key` / `AGENTX_API_KEY` from the environment.
- The web GUI is a proof-of-concept only; expect broken and incomplete flows, and keep CLI behavior as the source of truth.
- When editing files, keep the behavior aligned with the current tests and update tests when behavior changes.

## Tooling
- Use `npm test` to verify changes; it runs coverage by default.
- When working on coverage gaps, inspect `coverage/coverage-final.json` (or the generated coverage report) first so you are debugging real misses instead of guessing.
- Keep runtime output concise and purposeful.
- If you add a new module under `src/`, give it a single responsibility.

## Agent Behavior
- The agent should wait for the user’s first message before contacting OpenAI.
- Respect `/clear`, `/quit`, and `/exit`.
- Run commands that start with `>` locally in the shell and buffer their output into the next AI request.
- Persist the latest response id, usage totals, last user/assistant messages, pending CLI transcript, and pending tool calls in `.agentx_responseid` in the current working directory.
- Continue using the Responses API with `previous_response_id` and `store: true` for session continuity.
- The runtime now uses the direct `openai` package and a WebSocket transport for Responses API calls.
- Shell tool calls may arrive as `shell_call` function calls with parallel command groups and per-group working directories. Interrupted sessions may prompt the user to resume, retry, or start a new session before returning to the REPL.
- Server-side compaction is configured in `prompt.json`; there is no manual `/compact` command.

## Runtime Notes
- The executable may be launched through a symlink such as `/usr/bin/agentx`; the entrypoint must resolve the real path before deciding whether to start the REPL.
- The interactive prompt should reflect the current working directory and update after `cd`.
- `cd` is handled internally and must not be sent to OpenAI.
- `clear` clears the terminal display; `/clear` clears the stored response id and starts a new session.
- Tab completion should behave like a simple shell completer for files and folders in the current working directory.
- Tool calls should print concise status lines in the terminal, not full tool output.
