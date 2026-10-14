# Command reference

Use these commands in an interactive AgentX session unless this guide marks them as startup options.

## Session commands

| Command                          | Action                                                |
| -------------------------------- | ----------------------------------------------------- |
| `cd PATH`                        | Change the session working directory.                 |
| `cd -`                           | Return to the previous working directory.             |
| `cd ~`                           | Change to your home directory.                        |
| `clear` or `/clear`              | Delete saved session state and start a fresh session. |
| `!clear`                         | Run the local terminal clear command.                 |
| `/usage`                         | Show token totals and estimated cost.                 |
| `/rollback`                      | Restore a successful response checkpoint.             |
| `/setup`                         | Edit settings and reload them into the session.       |
| `/goal TEXT`                     | Start an autonomous goal.                             |
| `/goal status`                   | Show the active goal status.                          |
| `/goal resume`                   | Resume a goal that you paused in this session.        |
| `/goal cancel` or `/stop`        | Cancel the active goal.                               |
| `quit`, `exit`, `/quit`, `/exit` | Close AgentX.                                         |

Any other input becomes a message to OpenAI. Prefix a local shell command with `!`.

## Local shell

Enter `!` followed by a command to run it in the current directory. AgentX streams its output and saves it for the next message.

Direct local commands have no automatic timeout. Press Ctrl-C to stop a running command and return to AgentX.

The `shell_call` tool runs commands requested by the model. Press Ctrl-T to stop an active `shell_call`. AgentX then tells the model to stop and report current status.

## Goal mode

Goal mode continues until the model marks the goal complete, blocked, or incomplete. A blocked goal can ask you a question.

AgentX cancels a goal when you use `/goal cancel`, `/stop`, or Ctrl-C. AgentX discards saved goal state at startup.

## Startup options

Pass these options when you start `agentx`:

| Option                   | Action                                                  |
| ------------------------ | ------------------------------------------------------- |
| `--help`, `-h`, `-?`     | Show help and exit.                                     |
| `--version`, `-v`        | Show the package version and exit.                      |
| `--check-mcp`, `-K`      | Check MCP settings without contacting servers.          |
| `--debug`                | Show raw transport logs and hide live status lines.     |
| `--confirm`              | Ask for approval before high-risk tool calls.           |
| `--yolo`                 | Use the legacy option that bypasses confirmation.       |
| `--cwd PATH`, `-C PATH`  | Set the session working directory.                      |
| `--quiet`, `-q`          | Hide usage, timers, tool output, and web-search output. |
| `--no-usage`, `-u`       | Hide usage output.                                      |
| `--no-colors`, `-c`      | Hide AgentX color codes.                                |
| `--no-timers`, `-t`      | Hide status timers.                                     |
| `--no-reasoning`, `-r`   | Hide reasoning output.                                  |
| `--no-shell-calls`, `-s` | Hide shell-call output.                                 |
| `--no-tool-calls`, `-o`  | Hide non-shell tool output.                             |
| `--no-mcp`, `-m`         | Omit MCP tools from the request.                        |
| `--no-mcp-output`, `-M`  | Hide MCP output and keep MCP tools enabled.             |
| `--no-websearch`, `-w`   | Hide web-search output.                                 |

You can stack short output options. For example, `agentx -qur` hides usage, reasoning, and other quiet-mode output.

Output options change terminal display. They do not change tool execution, usage totals, reasoning settings, or request content. `--no-mcp` changes the request tool list.

## One-shot mode

Pass a quoted message after the command:

```sh
agentx "summarize this project"
```

AgentX sends one request, runs tool calls, prints the response and usage summary, then exits. It uses the latest successful checkpoint and a separate pending-state file.

## Output and exit codes

AgentX writes prompts, responses, and status to stdout. It writes startup failures and diagnostics to stderr.

Code `0` means success. A nonzero code means failure. Help and version options exit with code `0`.

AgentX has no JSON output mode. It does not provide a dry-run option. Tool permission checks are advisory and do not isolate shell commands. Use `--confirm` when you need approval prompts.
