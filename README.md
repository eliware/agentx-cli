# [![eliware.org](https://eliware.org/logos/brand.png)](https://discord.gg/M6aTR9eTwN)

[![npm version](https://img.shields.io/npm/v/@eliware/agentx-cli.svg)](https://www.npmjs.com/package/@eliware/agentx-cli) [![license](https://img.shields.io/github/license/eliware/agentx-cli.svg)](LICENSE) [![build status](https://github.com/eliware/agentx-cli/actions/workflows/nodejs.yml/badge.svg)](https://github.com/eliware/agentx-cli)

## @eliware/agentx-cli

`agentx` is a lightweight terminal chat agent built on the OpenAI Responses API over WebSocket transport.
Install the published package globally, run `agentx-setup` once, and then start `agentx`.

It is designed to feel shell-like:
- waits for your first message before calling OpenAI
- supports internal `cd`, `clear`, `/clear`, `/usage`, `/rollback`, `/setup`, `quit`, and `exit`
- supports direct shell commands with a leading `!`
- supports tab completion for local files and folders, including after changing directories
- remembers interactive session state in `.agentx_responseid` and successful checkpoints in `.agentx_checkpoint`
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

For a single request, run:

```bash
agentx "summarize this project"
```

One-shot mode prints the response and usage summary, then exits. Tool execution is approved by default; use `--confirm` to enable confirmation prompts.

If you are working from the repository itself, run `node agentx.mjs`.

Quick flags:

- `agentx --help`, `agentx -h`, or `agentx -?` prints quick help
- `agentx --version` or `agentx -v` prints the package version
- `agentx --debug` prints raw websocket logs and suppresses live status lines
- `agentx --confirm` enables confirmation prompts; approval is the default
- `agentx "message"` sends one request, performs tool calls, prints the response and usage summary, then exits

## Behavior

- Type a normal message to send it to OpenAI.
- Type `cd /path/to/dir` to change the local working directory without calling OpenAI.
- Type `!ls` to run a local shell command directly; its output is buffered for the next AI request. Direct `!` commands have no automatic timeout; press Ctrl-C to terminate one and return to AgentX. Ctrl-T remains for interrupting model-requested shell tools; the interruption result tells the agent to stop, not retry, and report current status.
  * `clear` or `/clear`: clear saved session state and start a fresh conversation.
  * `!clear`: runs the local shell `clear` command, clearing only the terminal display.
- Type `/usage` to view token and cost totals.
- Type `/rollback` to restore a successful response checkpoint.
- Recoverable API failures keep the REPL alive and offer retry, new-chain, rollback, or clear options.
- Successful turns update `.agentx_checkpoint`; one-shot invocations branch from that checkpoint and use isolated pending state, so multiple one-shots can run in the same folder without sharing interrupted tool calls.
- Type `/setup` to edit the API key, model, reasoning, output, and compaction settings, then reload them without ending the session; setup errors return to the REPL.
- Type `quit`, `exit`, `/quit`, or `/exit` to leave the app.

## Docs

User-facing docs live in [`docs/`](./docs):

- [Quickstart](./docs/quickstart.md)
- [Command reference](./docs/commands.md)
- [Session state](./docs/session-state.md)
- [Examples](./docs/examples.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Configuration](./docs/configuration.md)
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

## Security

- Never commit `agentx_api_key`, `AGENTX_API_KEY`, MCP credentials, or other secrets.
- Store the API key in the environment or in the user-owned `~/.agentx` configuration file.
- Keep `~/.agentx.mcp.json` user-owned and protect any credentials referenced by MCP servers.
- AgentX does not use a project `.env.example`; configuration is intentionally user-local or environment-based.

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

## Parallel workers

AgentX exposes asynchronous worker tools:

- `spawn_agent`: starts 1-3 independent AgentX workers and returns IDs immediately; use `read`, `write`, or `execute` permissions (default: `execute`). Nested spawning is disabled.
- `agent_status`: reports status, elapsed time, line count, a bounded log view, and usage. By default, output is the last 2048 bytes. Use `output_bytes`/`output_offset` for byte-based pagination or `search` for a regular-expression search across retained output. Workers have bounded output, a finite lifetime, and are terminated when the parent exits. Use `wait` and optional `timeout_ms` to block until completion or return partial progress.
- `cancel_agent`: terminates hung, stalled, or off-task workers.

Workers use automatic approval by default, have independent conversations, and share the parent working directory. Use workspace files for intentional coordination; avoid simultaneous edits to the same file. Cancel workers that become hung or go off task.

## Support

For help, questions, or community chat:

[eliware.org on Discord](https://discord.gg/M6aTR9eTwN)

## Links

- [Home Page](https://eliware.org)
- [GitHub Repo](https://github.com/eliware/agentx-cli)
- [GitHub Org](https://github.com/eliware)
- [Discord](https://discord.gg/M6aTR9eTwN)
