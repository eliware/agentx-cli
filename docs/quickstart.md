# Quickstart

AgentX is a terminal chat agent built on the OpenAI Responses API over WebSocket transport.
For most users, the simplest path is: install it globally, run `agentx-setup` once, then start `agentx`.
## Start the CLI

If you installed the package globally, use:

```bash
agentx
```

If you are working from the repository root, use:

```bash
node agentx.mjs
```

## Optional: run the setup helper

```bash
agentx-setup
```

Use that to save your OpenAI API key and runtime settings in `~/.agentx`.

## Quick flags

- `agentx --help` or `agentx -h` shows quick help
- `agentx --version` or `agentx -v` prints the package version
- `agentx --debug` prints raw websocket logs and suppresses live status lines

## Before you begin

Set your API key in the shell environment, or let `agentx-setup` write it into `~/.agentx` for you:

```bash
export agentx_api_key="your-key-here"
# or: export AGENTX_API_KEY="your-key-here"
```

AgentX prefers `agentx_api_key` and falls back to `AGENTX_API_KEY`.
The launchers load `~/.agentx` when present. Startup also displays the active model and runtime settings.

## First run

1. Start AgentX.
2. Type a normal message and press Enter.
3. AgentX sends that message to OpenAI.
4. The response streams into the terminal as it is generated.

## What to expect

- The prompt shows your user, short hostname, current working directory, and a `#` marker.
- AgentX waits for your first message before contacting OpenAI.
- Tool calls may stream command arguments and shell summaries live.
- If `.agentx_responseid` exists, the session resumes automatically. If it contains pending tool calls, AgentX asks how you want to continue.

## Install or update

Install or update the latest release at any time with:

```bash
npm -g install @eliware/agentx-cli@latest
```

See [AGENTS.md behavior](agents.md) for how project instructions are discovered and loaded.

## Remove AgentX

```bash
npm -g uninstall @eliware/agentx-cli
rm -f $HOME/.agentx*
```
