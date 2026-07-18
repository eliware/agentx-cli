# Agent Instructions

## Project
- This repository contains `AgentX`, a lightweight terminal chat agent.
- The main CLI entrypoint is [`agentx.mjs`](./agentx.mjs), which wires into the implementation under [`src/`](./src).
- The setup entrypoint is [`agentx-setup.mjs`](./agentx-setup.mjs), which configures `~/.agentx` settings.

## Working Rules
- Prefer small, focused changes.
- Keep the codebase ESM-only.
- Preserve the interactive CLI behavior unless the user asks otherwise.
- The launchers load `.agentx` when present, but the app still reads `agentx_api_key` / `AGENTX_API_KEY` from the environment.
- Use `agentx-setup` for local setup tasks instead of hand-editing service files when possible.
- When editing files, keep the behavior aligned with the current tests and update tests when behavior changes.
- Tests are expected to pass cleanly on Linux, Windows, and GitHub Actions; keep the entire repository cross-platform friendly and avoid platform-specific assumptions.

## Tooling
- Use `npm run lint` for a fast static check and `npm test` to verify changes; `npm test` runs coverage by default.
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
- Shell tool calls may arrive as `shell_call` structured calls with sequential command steps, per-step working directories, timeouts, and output limits. Interrupted sessions may prompt the user to resume, retry, or start a new session before returning to the REPL.
- Server-side compaction is configured in `prompt.json`; there is no manual `/compact` command.
- The interactive `/setup` flow edits API key, model, reasoning, output, and compaction settings.
- Optional MCP tools are loaded from `~/.agentx.mcp.json`; use `.agentx.mcp.json.example` as the configuration shape.

## Runtime Notes
- The executable may be launched through a symlink such as `/usr/bin/agentx`; the entrypoint must resolve the real path before deciding whether to start the REPL.
- The interactive prompt should reflect the current working directory and update after `cd`.
- `cd` is handled internally and must not be sent to OpenAI.
- `clear` resets the saved session; `>clear` clears the terminal display; `/clear` clears the stored response id and starts a new session.
- Tab completion should behave like a simple shell completer for files and folders in the current working directory.
- Tool calls should print concise status lines in the terminal, not full tool output.
