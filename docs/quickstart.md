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
- `agentx --confirm` enables confirmation prompts; approval is the default
- `agentx --check-mcp` (or `-K`) validates MCP configuration without contacting APIs
- `agentx --cwd PATH` (or `-C PATH`) runs the session from a specific working directory; relative paths resolve from the launch directory
- `agentx --quiet` is useful for one-shot subagents: it keeps reasoning and the final response while suppressing usage, timers, and tool/status output
- Use `--no-reasoning` with `--quiet` to suppress reasoning too; output flags only affect rendering and do not disable reasoning in the API request
- `agentx --no-mcp` (or `-m`) omits MCP tools from the request; `--no-mcp-output` (or `-M`) keeps MCP enabled but hides MCP call output
- Short output flags can be stacked, for example `agentx -qur "run the tests"`
- `agentx "message"` runs one request, performs tool calls, prints the response and usage summary, then exits
- MCP calls and streamed arguments are shown in cyan when configured

## One-shot requests

Use a quoted argument when you want a single non-interactive request:

```bash
agentx "find the failing tests and explain them"
```

One-shot requests branch from the latest successful checkpoint. Their pending tool state is isolated from `.agentx_responseid`, allowing concurrent subtasks in the same directory.

## Before you begin

Set your API key in the shell environment, or let `agentx-setup` write it into `~/.agentx` for you:

```bash
export agentx_api_key="your-key-here"
# or: export AGENTX_API_KEY="your-key-here"
```

AgentX prefers `agentx_api_key` and falls back to `AGENTX_API_KEY`.
The launchers load `~/.agentx` when present. Startup also displays the active model and runtime settings.

## Optional MCP tools

To enable MCP tools, place an `.agentx.mcp.json` file in your home directory. Copy [`.agentx.mcp.json.example`](../.agentx.mcp.json.example) as a starting point and update its server URL and authorization. AgentX loads `~/.agentx.mcp.json` automatically; set `"enabled": false` on individual entries to keep them configured but disabled. A missing file is allowed, while invalid JSON prevents the prompt template from loading. See the [MCP smoke tests](./mcp-smoke-tests.md) for live verification commands.

## First run

1. Start AgentX.
2. Type a normal message and press Enter.
3. AgentX sends that message to OpenAI.
4. The response streams into the terminal as it is generated.

## What to expect

- The prompt shows your user, short hostname, current working directory, and a `#` marker.
- AgentX waits for your first message before contacting OpenAI.
- Tool calls may stream command arguments and shell summaries live.
- Interactive `!` commands have no automatic timeout; Ctrl-C stops the local command and returns to AgentX. Ctrl-T interrupts model-requested `shell_call` tools and tells the agent to stop, avoid retries, and report current status.
- If `.agentx_responseid` exists, the session resumes automatically. If it contains pending tool calls, AgentX asks how you want to continue. Recognized closed/lifetime WebSocket failures are retried with exponential backoff for up to 10 seconds before recovery.

## Install or update

Install or update the latest release at any time with:

```bash
npm -g install @eliware/agentx-cli@latest
```

See [AGENTS.md behavior](agents.md) for how project instructions are discovered and loaded. Path handling and shell launchers support Linux, macOS, and Windows.

## Remove AgentX

```bash
npm -g uninstall @eliware/agentx-cli
rm -f $HOME/.agentx*
```
