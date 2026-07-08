# Quickstart

AgentX is a terminal chat agent built on the OpenAI Responses API.

## Start it

From the repo root:

```bash
node agentx.mjs
```

Or, if you have a symlink installed:

```bash
agentx
```

## Quick flags

- `agentx --help` or `agentx -h` shows quick help
- `agentx --version` or `agentx -v` prints the package version
- `agentx --debug` prints OpenAI request and response logs

## Before you begin

Set your API key in the shell environment:

```bash
export agentx_api_key="your-key-here"
# or: export AGENTX_API_KEY="your-key-here"
```

AgentX prefers `agentx_api_key` and falls back to `AGENTX_API_KEY`.

## First run

1. Start AgentX.
2. Type a normal message and press Enter.
3. AgentX sends that message to OpenAI.
4. The response is shown in the terminal.

## What to expect

- The prompt shows your current working directory.
- AgentX waits for your first message before contacting OpenAI.
- If `.agentx_responseid` exists, the session resumes automatically.
