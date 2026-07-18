# TODO.md

## Batch 1: Configuration, Setup, and Session Initialization

Improve first-run setup, configuration, and the ability to change settings without restarting AgentX.

### Startup configuration

- When `agentx.mjs` starts and `$HOME/.agentx` is missing or not configured:
  - Ask whether to run `agentx-setup` now (`Y/n`).
  - After setup exits, start AgentX automatically if the file was created and an API key is configured.
- Always load `$HOME/AGENTS.md` when it exists.
- If no `AGENTS.md` files are found, suggest that the user ask AgentX to generate one.

### Setup menu

Update `agentx-setup` to support these settings:

- Model:
  - `gpt-5.6-luna` — small
  - `gpt-5.6-terra` — medium
  - `gpt-5.6-sol` — large
- Reasoning mode: `standard` (default) or `pro`.
- Reasoning effort: `none`, `low` (default), `medium`, `high`, `xhigh`, or `max`.
- Reasoning summary: `concise`, `detailed`, `auto` (default), or `null` (off).
- Output verbosity: `low` (default), `medium`, or `high`.
- Compaction threshold: `200k` tokens by default.
  - Warn that jumbo prompts cost 2× when the threshold exceeds `270k` tokens.
- Server-side MCP servers through the Responses API:
  - URL, label, and description.
  - Authentication: none, bearer token, or custom headers.
  - Warn that adding many MCP tools increases the cost of every request.

Make the setup menu navigable with Up/Down/Enter.

### In-app setup

- Add a `/setup` command that runs `agentx-setup` from inside AgentX.
- After setup exits, reload the new settings without ending the current session.

## Batch 2: Interactive Runtime, Status, and Streaming Behavior

Improve live output, timer handling, and session-clearing commands.

### Status and MCP events

- Change the timer/status sequence from `reasoning, executing, writing` to `reasoning, writing, executing`.
- Display MCP progress-update events when received.
- Count MCP processing time as executing time.

### Streaming reasoning summaries

- Handle streamed reasoning-summary output and display it in light orange.
- Pause and resume the timer/status output while reasoning summaries are being displayed.

### Clear commands

- Make both `/clear` and `clear` clear the session.
- Reserve `>clear` for clearing only the screen by running the local shell command.

## Batch 3: Usage, Pricing, and Documentation

Add accurate usage-cost reporting and document installation, removal, and AGENTS.md behavior.

### Usage and pricing

Implement per-model pricing calculations:

| Model | Description | Input | Cached input | Output |
| --- | --- | ---: | ---: | ---: |
| GPT-5.6 Luna | Fast, affordable model for everyday work | $1.00 / 1M tokens | $0.10 / 1M tokens | $6.00 / 1M tokens |
| GPT-5.6 Terra | Balanced model for efficient, high-volume work | $2.50 / 1M tokens | $0.25 / 1M tokens | $15.00 / 1M tokens |
| GPT-5.6 Sol | Flagship model for ambitious agentic work | $5.00 / 1M tokens | $0.50 / 1M tokens | $30.00 / 1M tokens |

Detect jumbo prompts during usage calculation:

- For inputs exceeding `270k` tokens, apply 2× input pricing.
- Display a warning whenever jumbo-prompt pricing is applied.

### Documentation

- Document that installation and updating can both use:

  `npm -g install @eliware/agentx-cli@latest`

- Add uninstall instructions:

  `npm -g uninstall @eliware/agentx-cli`
  `rm -f $HOME/.agentx*`

- Improve the `AGENTS.md` documentation to explain:
  - How files are discovered and loaded.
  - How inheritance works.
  - That loaded `AGENTS.md` files form part of the system prompt and larger files increase the cost of each request.
  - Best practices for keeping `AGENTS.md` files useful, focused, and concise.
