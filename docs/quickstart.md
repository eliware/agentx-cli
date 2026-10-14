# Quickstart

AgentX is a terminal chat agent. It sends your messages to the OpenAI Responses API.

## Requirements

- Node.js 26 or later.
- An OpenAI API key.
- Windows or Linux.

## Install and start

Install AgentX for your user:

```sh
npm install --global @eliware/agentx-cli@latest
```

Run setup to save your API key and settings:

```sh
agentx-setup
```

Start an interactive session:

```sh
agentx
```

From a repository checkout, run `node bin/agentx.mjs` instead.

## Send your first message

Type a message and press Enter. AgentX waits for your first message before it contacts OpenAI.

```text
Explain this project.
```

AgentX streams the response to your terminal. It may also call enabled tools.

## Set the API key in your shell

You can set the key in the process environment instead of using setup.

```sh
export agentx_api_key="your-key-here"
```

On PowerShell, use:

```powershell
$env:agentx_api_key = "your-key-here"
```

AgentX also accepts `AGENTX_API_KEY`. The lowercase name takes priority when both names have values.

## Send one request

Pass a message after the command to send one request and exit:

```sh
agentx "summarize this project"
```

One-shot mode uses the latest successful checkpoint. It keeps pending tool state in a separate temporary file.

## Useful options

- Run `agentx --help` to view commands and flags.
- Run `agentx --version` to view the installed version.
- Add `--cwd PATH` to set the session working directory.
- Add `--confirm` to request approval for high-risk tool calls.
- Add `--no-mcp` to omit MCP tools for one run.
- Add `--no-mcp-output` to hide MCP output while MCP tools remain available.
- Add `--quiet` to hide usage, timers, and tool output.
- Add `--no-reasoning` to hide reasoning output.

Read the [command guide](commands.md) for all flags.

## Use MCP tools

MCP servers are optional. Copy [the example file](../.agentx.mcp.json.example) to `~/.agentx.mcp.json` and set a server URL and required authorization.

Use `"enabled": false` to keep a server in the file without loading its tools. Run `agentx --check-mcp` to validate the file without contacting servers.

Read the [configuration guide](configuration.md) for MCP fields and security details.

## Interrupt work

Press Ctrl-C while a local `!` command runs to stop that command. AgentX then returns to its prompt.

Press Ctrl-T while a model-requested `shell_call` runs to interrupt that tool. AgentX asks the model to stop and report the current status.

## Update or remove AgentX

Run `npm install --global @eliware/agentx-cli@latest` to update AgentX. Run `npm uninstall --global @eliware/agentx-cli` to remove it.

Review files in your home directory before you delete AgentX settings or session data.
