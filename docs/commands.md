# Command reference

AgentX supports shell-like commands in the terminal, whether you launched it from a global install or from the repository.

## Internal commands

- `cd <path>`: change the local working directory
- `clear`: clear the saved session state
- `/clear`: clear the saved session state
- `>clear`: clear the terminal screen through the local shell
- `/usage`: print token and cost totals. Pricing follows the configured model:
  - `gpt-5.6-luna`: $1.00 input, $0.10 cached input, $6.00 output per million tokens
  - `gpt-5.6-terra`: $2.50 input, $0.25 cached input, $15.00 output per million tokens
  - `gpt-5.6-sol`: $5.00 input, $0.50 cached input, $30.00 output per million tokens

Inputs over 270,000 tokens use 2x pricing for input, cached input, and output; the usage report marks these requests with a light-red warning.
- `/setup`: edit the API key, model, reasoning, output, and compaction settings, then reload them without ending the session; setup errors return to the REPL
- `quit`, `exit`, `/quit`, `/exit`: leave the app

## Local shell commands

Prefix a line with `>` to run it locally.

Example:

```text
> ls
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
