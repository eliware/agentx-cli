# Configuration and setup

Setup persistence is separate from interactive setup orchestration. The settings-file module owns dotenv-style parsing, serialization, version migration, private permissions, atomic replacement, and file-path errors. The setup-editors module owns setting-choice matching, API-key editing, compaction validation, and saving edited values. The setup-presentation module owns menu-entry policy and setup-screen rendering. The setup module owns workflow coordination. Resolve the home directory when reading/writing so an invocation observes the current environment.

## Configuration file

The default file is `$HOME/.agentx`; it is dotenv-like `KEY=value` text. Preserve unrelated lines and comments when updating known keys. Duplicate known keys collapse to one updated entry. Values containing spaces or shell punctuation are double-quoted with backslash/quote escaping. Ensure the parent directory exists and end written files with one newline. Configuration files must be written atomically with mode `0600`; existing files must be tightened to `0600` when updated.

Known settings:

- `AGENTX_API_KEY` (required unless supplied in process environment)
- `AGENTX_MODEL`, default `gpt-6-luna`; setup offers `gpt-6-luna`, `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol`
- `AGENTX_REASONING_MODE`, default `standard`; choices `standard`, `pro`
- `AGENTX_REASONING_EFFORT`, default `low`; choices `none`, `low`, `medium`, `high`, `xhigh`, `max`
- `AGENTX_REASONING_SUMMARY`, default `auto`; choices `concise`, `detailed`, `auto`, `null`
- `AGENTX_OUTPUT_VERBOSITY`, default `low`; choices `low`, `medium`, `high`
- `AGENTX_COMPACTION_THRESHOLD`, default `200000`, positive integer tokens

`settingsFromEnv` reads uppercase names only for runtime settings. Invalid/zero compaction values fall back to the default.

## Setup UX

`agentx-setup` loads saved settings before applying defaults, so the menu displays the persisted model and other values on every run. Selecting any available value, including the default model, must persist that choice. On the first configuration read after this migration, migrate a saved `AGENTX_MODEL=gpt-5.6-luna` to `gpt-6-luna` and persist an internal config-version marker; do not rewrite any other explicitly configured model. Once marked, later explicit model choices—including `gpt-5.6-luna`—must remain unchanged.

`agentx-setup` requires an interactive TTY; otherwise print `AgentX setup requires an interactive terminal.` and return. Display version, install path, config path, MCP path, and whether the API key is set. Provide a raw-keyboard menu with number keys, arrows, Enter, and Ctrl-C/quit handling, with readline fallback for individual values.

The setup menu edits API key, model, reasoning mode/effort/summary, output verbosity, and compaction threshold. When editing an existing API key, show only its last 8 characters in the prompt; typed characters are masked with `*`. API key cannot be saved blank. Threshold strips non-digits and must be a positive integer; warn when above 270000 tokens.

Setting-editor rules are unit-tested in `tests/setup-editors.test.mjs`; menu and screen presentation are tested in `tests/setup-presentation.test.mjs`; `tests/setup.test.mjs` covers the interactive workflow and its coordination with persistence and editors.

`/setup` runs this flow during a session without leaving two readline interfaces attached, then reloads settings into `process.env` (except API key) and applies them to future requests.

# MCP configuration checks

MCP configuration has three focused boundaries: pure shape/auth/HTTPS validation, JSON file loading and error conversion, and user-facing result formatting. Each boundary is mirrored by its own test suite. The file layer delegates validation; formatting never reads files or exposes authorization values.
