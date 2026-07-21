# [![eliware.org](https://eliware.org/logos/brand.png)](https://discord.gg/M6aTR9eTwN)

## @eliware/agentx-cli

`agentx` is a lightweight terminal chat agent built on the OpenAI Responses API over WebSocket transport.
Install the published package globally, run `agentx-setup` once, and then start `agentx`.

It is designed to feel shell-like:
- waits for your first message before calling OpenAI
- supports internal `cd`, `clear`, `/clear`, `/usage`, `/setup`, `quit`, and `exit`
- supports direct shell commands with a leading `>`
- supports tab completion for local files and folders, including after changing directories
- remembers session state in `.agentx_responseid`
- can prompt to resume interrupted tool execution on startup
- includes quick CLI flags for help, version, and debug logging
- handles temporary WebSocket connectivity failures and shuts down connections gracefully
- prints active model and runtime settings at startup
- prints friendly startup errors for missing config or API keys
- supports optional MCP tools configured in `~/.agentx.mcp.json`

## Usage

```bash
npm -g install @eliware/agentx-cli@latest
agentx-setup
agentx
```

If you are working from the repository itself, run `node agentx.mjs`.

Quick flags:

- `agentx --help`, `agentx -h`, or `agentx -?` prints quick help
- `agentx --version` or `agentx -v` prints the package version
- `agentx --debug` prints raw websocket logs and suppresses live status lines

## Behavior

- Type a normal message to send it to OpenAI.
- Type `cd /path/to/dir` to change the local working directory without calling OpenAI.
- Type `>ls` to run a local shell command directly; its output is buffered for the next AI request.
  * `clear`: resets the session state and starts a fresh conversation.
  * `/clear`: also resets the session state and restarts the conversation.
  * `>clear`: runs the local shell clear command, clearing only the terminal display.
- Type `/usage` to view token and cost totals.
- Type `/setup` to edit the API key, model, reasoning, output, and compaction settings, then reload them without ending the session; setup errors return to the REPL.
- Type `quit`, `exit`, `/quit`, or `/exit` to leave the app.

## Docs

User-facing docs live in [`docs/`](./docs):

- [Quickstart](./docs/quickstart.md)
- [Command reference](./docs/commands.md)
- [Session state](./docs/session-state.md)
- [Examples](./docs/examples.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [AGENTS.md behavior](./docs/agents.md)

## Development

- Main entrypoint: [`agentx.mjs`](./agentx.mjs)
- Setup entrypoint: [`agentx-setup.mjs`](./agentx-setup.mjs)
- Official behavior specifications: [`specs/`](./specs)
- Implementation modules: [`src/`](./src)

This project uses Spec Driven Development. Update the relevant spec first, then tests, then implementation. Tests are secondary to the specs, and implementation is third. Maintain 100% test coverage across all files and always fix lint warnings.

Run lint and tests with:

```bash
npm run lint
npm test
```

## Environment

Set your OpenAI key in the shell environment, or let `agentx-setup` write it to `~/.agentx`:

```bash
export agentx_api_key="your-key-here"
# or: export AGENTX_API_KEY="your-key-here"
```

The launchers load `~/.agentx` when present.

## MCP tools

AgentX automatically loads an optional `.agentx.mcp.json` from your home directory and merges its MCP tool definitions into the request. Start with [`.agentx.mcp.json.example`](./.agentx.mcp.json.example), then copy it to `~/.agentx.mcp.json` and add your server configuration. The example file is ignored by Git when copied or customized locally. MCP calls and streamed arguments are displayed in cyan.

## License

[MIT © 2025 Eli Sterling, eliware.org](LICENSE)

## Install, update, and uninstall

Install or update the latest release with:

```bash
npm -g install @eliware/agentx-cli@latest
```

Remove AgentX and its local configuration with:

```bash
npm -g uninstall @eliware/agentx-cli
rm -f $HOME/.agentx*
```

See [AGENTS.md behavior](./docs/agents.md) for discovery, inheritance, prompt-cost implications, and maintenance guidance.
