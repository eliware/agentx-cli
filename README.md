# [![eliware.org](https://eliware.org/logos/brand.png)](https://discord.gg/M6aTR9eTwN)

## @eliware/agentx-cli [![npm version](https://img.shields.io/npm/v/@eliware/agentx-cli.svg)](https://www.npmjs.com/package/@eliware/agentx-cli)[![license](https://img.shields.io/github/license/eliware/agentx-cli.svg)](LICENSE)[![build status](https://github.com/eliware/agentx-cli/actions/workflows/nodejs.yml/badge.svg)](https://github.com/eliware/agentx-cli/actions)

`agentx` is a lightweight terminal chat agent built on the OpenAI Responses API over WebSocket transport.
If you just want to use it, install the published package globally, run `agentx-setup` once, and then start `agentx`.
A browser-based web GUI is also included, but it is only a proof of concept and still rough.
A separate `agentx-setup` helper can edit `.env` values and manage the GUI service on Linux.

It is designed to feel shell-like:
- waits for your first message before calling OpenAI
- supports internal `cd`, `clear`, `quit`, and `exit`
- supports direct shell commands with a leading `>`
- supports tab completion for local files and folders
- remembers the last response id, usage counters, last user/assistant messages, pending shell transcript, and pending tool calls in `.agentx_responseid`
- can prompt to resume interrupted tool execution on startup
- can be launched directly from `agentx.mjs`, through a symlink like `/usr/bin/agentx`, or from installed `agentx` / `agentx-setup` bins on your PATH
- includes an experimental browser GUI, but it is still a proof of concept and many flows are broken or incomplete
- includes quick CLI flags for help, version, and debug logging
- prints friendly startup errors for missing config or API keys

---

## Table of Contents

- [Features](#features)
- [Usage](#usage)
- [Behavior](#behavior)
- [Docs](#docs)
- [Development](#development)
- [Testing](#testing)
- [Environment](#environment)
- [License](#license)

## Features

- ESM Node.js project
- Interactive REPL-style chat loop
- `AGENTS.md` support from the current working directory
- Current working directory shown in the prompt
- Internal session persistence with `previous_response_id`
- Built-in `shell_call` tool with sequential command steps
- Server-side Responses API compaction for long-running sessions
- Concise terminal output for tool calls
- Sorted path completion, with quoted suggestions for paths containing spaces
- Experimental browser GUI served by the local AgentX backend

## Usage

If you just want to use AgentX, install the published package globally:

```bash
npm install -g @eliware/agentx-cli
```

Then run the setup helper once:

```bash
agentx-setup
```

That will help you set your API key and, on Linux, install or repair the GUI service if you want it.
After that, start the chat client with:

```bash
agentx
```

If you are working from the repository itself, you can also run `node agentx.mjs` instead of the global binary.

To try the experimental web GUI from the repository:

```bash
npm run start:gui
```

Then open the local port it prints, usually `http://localhost:3100`.
The GUI is a proof of concept and a lot of things are still broken or incomplete.

Quick flags:

- `agentx --help`, `agentx -h`, or `agentx -?` prints quick help
- `agentx --version` or `agentx -v` prints the package version
- `agentx --debug` prints raw websocket send/receive logs

The prompt will look like this:

```text
[AgentX root@dev:/opt/agentx-cli] 
```

## Behavior

- Type a normal message to send it to OpenAI.
- Type `cd /path/to/dir` to change the local working directory without calling OpenAI.
- Type `>ls` to run a local shell command directly; its output is buffered and prepended to the next AI request.
- Type `clear` to clear the terminal display.
- Type `/clear` to clear the saved session id and start a new conversation on the next message.
- Type `quit`, `exit`, `/quit`, or `/exit` to leave the app.
- Tab completion suggests files and folders from the current working directory.
- Suggestions are sorted, and entries with spaces are quoted.
- Tool calls are shown as short status lines instead of full raw output.

### Session State

The app stores the latest response id, usage counters, last user/assistant messages, pending shell transcript, and any pending tool calls in `.agentx_responseid` in the current working directory.

If that file exists on startup, the app resumes the conversation from the stored response id and prints the last exchanged messages. If there are pending tool calls, AgentX prompts you to choose how to continue before returning to the REPL. Pending shell output is preserved until the next AI request. Long sessions rely on server-side compaction configured in `prompt.json`. If `prompt.json` cannot be read or the API key is missing, startup stops with a clear error message.

### Prompt Assembly

On the first message of a new session, the agent loads `prompt.json`, injects:
- the contents of the current working directory’s `AGENTS.md` if present
- the current working directory path
- the user’s first message

If `AGENTS.md` is missing, the app prints a notice and continues with a fallback instruction.

## Docs

User-facing docs live in [`docs/`](./docs). Start with [Quickstart](./docs/quickstart.md) if you just want to use AgentX.

- [Quickstart](./docs/quickstart.md)
- [Command reference](./docs/commands.md)
- [Session state](./docs/session-state.md)
- [Examples](./docs/examples.md)
- [Web GUI](./docs/web-gui.md)
- [Troubleshooting](./docs/troubleshooting.md)

## Development

This section is for contributors working from the repository. If you just want to use AgentX, use [Usage](#usage) and [Quickstart](./docs/quickstart.md).

- Main entrypoint: [`agentx.mjs`](./agentx.mjs)
- Setup entrypoint: [`agentx-setup.mjs`](./agentx-setup.mjs)
- Web GUI entrypoint: [`agentx-gui.mjs`](./agentx-gui.mjs)
- Implementation modules: [`src/`](./src)
- Package installs expose the `agentx` and `agentx-setup` CLIs via `bin`
- Launch the app locally:

  ```bash
  node agentx.mjs
  ```

## Testing

Run the test suite with:

```bash
npm test
```

The test command also collects coverage.

The tests cover:
- prompt assembly
- internal command parsing
- path completion
- tool output truncation
- runtime launch behavior

## Environment

Set your OpenAI key in the shell environment, or let `agentx-setup` write it for you after the global install:

```bash
export agentx_api_key="your-key-here"
# or: export AGENTX_API_KEY="your-key-here"
```

AgentX prefers `agentx_api_key` and falls back to `AGENTX_API_KEY`.
The launchers also load `.env` when present.

If you want a guided local setup flow, run:

```bash
agentx-setup
```

That helper can edit `.env` values and manage the Linux GUI service.

## License

[MIT © 2025 Eli Sterling, eliware.org](LICENSE)
