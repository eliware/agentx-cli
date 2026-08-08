# Command reference

AgentX supports shell-like commands in the terminal, whether you launched it from a global install or from the repository.

## Internal commands

- `cd <path>`: change the local working directory
- `clear` or `/clear`: clear saved session state and start a fresh conversation
- `!clear`: run the local shell `clear` command; this affects only the terminal display
- `/usage`: print token and cost totals. Pricing follows the configured model:
  - `gpt-5.6-luna`: $0.20 input, $0.02 cached input, $1.20 output per million tokens
  - `gpt-5.6-terra`: $2.00 input, $0.20 cached input, $12.00 output per million tokens
  - `gpt-5.6-sol`: $5.00 input, $0.50 cached input, $30.00 output per million tokens

Inputs over 272,000 tokens use long-context pricing: 2x input/cached input and 1.5x output; the usage report marks these requests with a light-red warning.
- `/rollback`: choose a successful response checkpoint to restore; pending tool calls are cleared and newer checkpoints are discarded
- `/setup`: edit API key, model, reasoning, output, and compaction settings, then reload them without ending the session
- `quit`, `exit`, `/quit`, `/exit`: leave the app

## Local shell commands

Prefix a line with `!` to run it locally. Direct commands have no automatic timeout. While one runs, press Ctrl-C to terminate it and return to AgentX; Ctrl-C does not exit AgentX in this case. Ctrl-T remains reserved for interrupting model-requested `shell_call` tools; the resulting tool message tells the agent to stop, avoid retries, and report current status.

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

## One-shot mode

Pass a quoted message after the command to send one request and exit after the response and usage summary:

```bash
agentx "review the current project status"
```

One-shot mode inherits the latest successful checkpoint, but uses its own pending-state file. Multiple one-shots can run concurrently in the same directory without resuming or overwriting the interactive session's pending tool calls.

## Startup flags

These are command-line flags, not in-app commands:

- `--help`, `-h`, `-?`: show quick help and exit
- `--version`, `-v`: print the package version and exit
- `--debug`: print raw websocket logs and suppress live status lines. MCP and reasoning argument deltas are filtered where appropriate to keep raw diagnostics readable.
- `--confirm`: enable confirmation prompts for model-requested CLI tool calls. Without it, approval is automatic. `--yolo` remains a legacy alias.

Flags can be combined, for example `agentx --debug --confirm "run the test suite"`.

## Output and exit status

Interactive mode writes prompts, responses, and status to stdout. Diagnostics, startup failures, and debug transport events are written to stderr. `agentx --help` and `agentx --version` are stable text interfaces; AgentX does not currently provide a JSON output mode.

Invalid startup/configuration failures return a nonzero exit status. Successful help, version, and one-shot requests return zero.

AgentX does not provide `--dry-run`: its write-capable behavior is limited to user-local session/configuration state and model-requested shell commands. Use `--confirm` for tool execution and inspect commands before approval when writes are possible.
