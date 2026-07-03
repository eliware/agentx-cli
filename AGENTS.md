# Agent Instructions

## Project
- This repository contains `AgentX`, a lightweight terminal chat agent.
- The entrypoint is [`agentx.mjs`](./agentx.mjs), which wires into the implementation under [`src/`](./src).

## Working Rules
- Prefer small, focused changes.
- Keep the codebase ESM-only.
- Preserve the interactive CLI behavior unless the user asks otherwise.
- Do not add dotenv or `.env` support for `agentx_api_key`; the agent should use the environment directly.
- When editing files, keep the behavior aligned with the current tests and update tests when behavior changes.

## Tooling
- Use `npm test` to verify changes.
- Keep runtime output concise and purposeful.
- If you add a new module under `src/`, give it a single responsibility.

## Agent Behavior
- The agent should wait for the user’s first message before contacting OpenAI.
- Respect `/clear`, `/quit`, and `/exit`.
- Persist the latest response id in `.agentx_responseid` in the current working directory.
- Continue using the Responses API with `previous_response_id` and `store: true` for session continuity.

## Runtime Notes
- The executable may be launched through a symlink such as `/usr/bin/agentx`; the entrypoint must resolve the real path before deciding whether to start the REPL.
- The interactive prompt should reflect the current working directory and update after `cd`.
- `cd` is handled internally and must not be sent to OpenAI.
- `clear` clears the terminal display; `/clear` clears the stored response id and starts a new session.
- Tab completion should behave like a simple shell completer for files and folders in the current working directory.
- Tool calls should print concise status lines in the terminal, not full tool output.
