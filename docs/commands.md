# Command reference

AgentX supports shell-like commands in the terminal.

## Internal commands

- `cd <path>`: change the local working directory
- `clear`: clear the terminal screen
- `/clear`: clear the saved session state
- `/usage`: print token and cost totals
- `quit`, `exit`, `/quit`, `/exit`: leave the app

## Local shell commands

Prefix a line with `>` to run it locally.

Example:

```text
> ls
```

The output is stored and prepended to the next AI request.

This is separate from AgentX's internal `shell_call` tool, which the model uses for its own shell work and may group commands internally.

## Chat messages

Any other input is sent to OpenAI as a user message.

## Tab completion

Tab completion suggests files and folders from the current directory.
Paths with spaces are quoted.

## Startup flags

These are command-line flags, not in-app commands:

- `--help`, `-h`, `-?`: show quick help and exit
- `--version`, `-v`: print the package version and exit
- `--debug`: print raw websocket send and receive logs
