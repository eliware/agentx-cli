# Command reference

AgentX supports shell-like commands in the terminal, whether you launched it from a global install or from the repository.

## Internal commands

- `cd <path>`: change the local working directory
- `clear`: clear saved session state and start a fresh conversation
- `/clear`: same as `clear`
- `!clear`: clear only the terminal display through the local shell
- `/usage`: print token and cost totals. Pricing follows the configured model:
  - `gpt-5.6-luna`: $0.20 input, $0.02 cached input, $1.20 output per million tokens
  - `gpt-5.6-terra`: $2.00 input, $0.20 cached input, $12.00 output per million tokens
  - `gpt-5.6-sol`: $5.00 input, $0.50 cached input, $30.00 output per million tokens

Inputs over 272,000 tokens use long-context pricing: 2x input/cached input and 1.5x output; the usage report marks these requests with a light-red warning.
- `/rollback`: choose a successful response checkpoint to restore; pending tool calls are cleared and newer checkpoints are discarded
- `/setup`: edit API key, model, reasoning, output, and compaction settings, then reload them without ending the session
- `quit`, `exit`, `/quit`, `/exit`: leave the app

## Local shell commands

Prefix a line with `!` to run it locally.

Example:

```text
! ls
```

The output is stored and prepended to the next AI request.

This is separate from AgentX's internal `shell_call` tool, which the model uses for its own shell work and may run multiple commands in sequence internally.

## Chat messages

Any other input is sent to OpenAI as a user message.

## Tab completion

Tab completion suggests files and folders from the current directory. It follows the active directory after `cd` without creating duplicate input listeners.
Paths with spaces are quoted.

## Startup flags

These are command-line flags, not in-app commands:

- `--help`, `-h`, `-?`: show quick help and exit
- `--version`, `-v`: print the package version and exit
- `--debug`: print raw websocket logs and suppress live status lines. MCP and reasoning argument deltas are filtered where appropriate to keep raw diagnostics readable.
