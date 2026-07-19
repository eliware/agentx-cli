# Configuration and setup

## Configuration file
The default file is `$HOME/.agentx`; it is dotenv-like `KEY=value` text. Preserve unrelated lines and comments when updating known keys. Duplicate known keys collapse to one updated entry. Values containing spaces or shell punctuation are double-quoted with backslash/quote escaping. Ensure the parent directory exists and end written files with one newline.

Known settings:
- `AGENTX_API_KEY` (required unless supplied in process environment)
- `AGENTX_MODEL`, default `gpt-5.6-luna`
- `AGENTX_REASONING_MODE`, default `standard`; choices `standard`, `pro`
- `AGENTX_REASONING_EFFORT`, default `low`; choices `none`, `low`, `medium`, `high`, `xhigh`, `max`
- `AGENTX_REASONING_SUMMARY`, default `auto`; choices `concise`, `detailed`, `auto`, `null`
- `AGENTX_OUTPUT_VERBOSITY`, default `low`; choices `low`, `medium`, `high`
- `AGENTX_COMPACTION_THRESHOLD`, default `200000`, positive integer tokens

`settingsFromEnv` reads uppercase names only for runtime settings. Invalid/zero compaction values fall back to the default.

## Setup UX
`agentx-setup` requires an interactive TTY; otherwise print `AgentX setup requires an interactive terminal.` and return. Display version, install path, config path, MCP path, and whether the API key is set. Provide a raw-keyboard menu with number keys, arrows, Enter, and Ctrl-C/quit handling, with readline fallback for individual values.

The setup menu edits API key, model, reasoning mode/effort/summary, output verbosity, and compaction threshold. API key cannot be saved blank. Threshold strips non-digits and must be a positive integer; warn when above 270000 tokens.

`/setup` runs this flow during a session without leaving two readline interfaces attached, then reloads settings into `process.env` (except API key) and applies them to future requests.
