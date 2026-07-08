# [![eliware.org](https://eliware.org/logos/brand.png)](https://discord.gg/M6aTR9eTwN)

## @eliware/agentx [![npm version](https://img.shields.io/npm/v/@eliware/agentx.svg)](https://www.npmjs.com/package/@eliware/agentx)[![license](https://img.shields.io/github/license/eliware/agentx.svg)](LICENSE)[![build status](https://github.com/eliware/agentx/actions/workflows/nodejs.yml/badge.svg)](https://github.com/eliware/agentx/actions)

`agentx` is a lightweight terminal chat agent built on the OpenAI Responses API.

It is designed to feel shell-like:
- waits for your first message before calling OpenAI
- supports internal `cd`, `clear`, `quit`, and `exit`
- supports direct shell commands with a leading `>`
- supports tab completion for local files and folders
- remembers the last response id, usage counters, last user/assistant messages, and pending shell transcript in `.agentx_responseid`
- can be launched directly from `agentx.mjs` or through a symlink like `/usr/bin/agentx`
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
- Built-in `shell_call` tool
- Server-side Responses API compaction for long-running sessions
- Concise terminal output for tool calls
- Sorted path completion, with quoted suggestions for paths containing spaces

## Usage

Start the agent from the repository root or from any working directory:

```bash
node agentx.mjs
```

If you have a symlink installed, you can also run:

```bash
agentx
```

Quick flags:

- `agentx --help`, `agentx -h`, or `agentx -?` prints quick help
- `agentx --version` or `agentx -v` prints the package version
- `agentx --debug` prints OpenAI request/response logs

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

The app stores the latest response id, usage counters, last user/assistant messages, and pending shell transcript in `.agentx_responseid` in the current working directory.

If that file exists on startup, the app resumes the conversation from the stored response id and prints the last exchanged messages. Pending shell output is preserved until the next AI request. Long sessions rely on server-side compaction configured in `prompt.json`. If `prompt.json` cannot be read or the API key is missing, startup stops with a clear error message.

### Prompt Assembly

On the first message of a new session, the agent loads `prompt.json`, injects:
- the contents of the current working directory’s `AGENTS.md` if present
- the current working directory path
- the user’s first message

If `AGENTS.md` is missing, the app prints a notice and continues with a fallback instruction.

## Docs

User-facing docs live in [`docs/`](./docs):

- [Quickstart](./docs/quickstart.md)
- [Command reference](./docs/commands.md)
- [Session state](./docs/session-state.md)
- [Examples](./docs/examples.md)
- [Troubleshooting](./docs/troubleshooting.md)

## Development

- Main entrypoint: [`agentx.mjs`](./agentx.mjs)
- Implementation modules: [`src/`](./src)
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

Set your OpenAI key in the shell environment:

```bash
export agentx_api_key="your-key-here"
# or: export AGENTX_API_KEY="your-key-here"
```

AgentX prefers `agentx_api_key` and falls back to `AGENTX_API_KEY`. It does not require dotenv or a `.env` file.

## License

[MIT © 2025 Eli Sterling, eliware.org](LICENSE)
