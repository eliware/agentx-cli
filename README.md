# [![eliware.org](https://eliware.org/logos/brand.png)](https://discord.gg/M6aTR9eTwN)

## @eliware/agentx-cli [![npm version](https://img.shields.io/npm/v/@eliware/agentx-cli.svg)](https://www.npmjs.com/package/@eliware/agentx-cli) [![license](https://img.shields.io/github/license/eliware/agentx-cli.svg)](LICENSE) [![CI](https://github.com/eliware/agentx-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/eliware/agentx-cli/actions/workflows/ci.yml)

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Setup](#setup)
- [Usage](#usage)
- [Development](#development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Configuration](#configuration)
- [Operations](#operations)
- [Commands](#commands)
- [Exit codes](#exit-codes)
- [Support](#support)
- [License](#license)
- [Links](#links)

## Features

AgentX is a lightweight terminal chat agent built on the OpenAI Responses API through the official @eliware/openai client. It waits for your first message before contacting OpenAI, supports shell-like navigation and tab completion, runs explicitly prefixed local shell commands, and offers optional MCP tools and independent worker agents. Session state and successful checkpoints support recovery and resume workflows. The package description is “A lightweight terminal chat agent built on the OpenAI Responses API through the official @eliware/openai client.” Package author: Eliware (Eli Sterling) <eli@eliware.org>.

## Requirements

- Node.js 26.x.
- An OpenAI API key supplied through the environment or user-local configuration.
- Windows, Linux, or macOS terminal. Platform-specific shell commands follow the host shell.

## Setup

Install the published package and configure it interactively:

```sh
npm install --global @eliware/agentx-cli@latest
agentx-setup
```

The setup command stores configuration in the user's home directory. To update, install `@latest` again. Remove the package with `npm uninstall --global @eliware/agentx-cli`; remove local configuration separately through the setup tool or by explicitly deleting the intended user-owned files.

## Usage

Install the published `@eliware/agentx-cli` package globally with `npm install --global @eliware/agentx-cli@latest`. The package entrypoints are `agentx` (`bin/agentx.mjs`) and `agentx-setup` (`bin/agentx-setup.mjs`): run `agentx-setup` to configure user-local settings, then run `agentx` to start an interactive session. Use `agentx-setup --help` for setup options and `agentx-setup --version` to print the package version. For a single request that exits after responding, run `agentx "summarize this project"`. One-shot tool execution is approved by default; pass `--confirm` to request confirmation. In an interactive session, type a normal message to contact the model, use `cd PATH` to change the local working directory without a model request, and prefix a local shell command with `!` (for example, `!git status`).

The published package version is maintained in `package.json` and exposed by `agentx --version`; the version available through `@latest` is the latest published release and may differ from the checkout. See [`RELEASE_NOTES.md`](./RELEASE_NOTES.md) for versioned changes.

Interactive commands include `clear` or `/clear` to start a fresh conversation, `/usage` to show token and cost totals, `/rollback` to restore a successful response checkpoint, `/setup` to edit settings, and `quit`, `exit`, `/quit`, or `/exit` to leave. `!clear` clears only the terminal display. WebSocket recovery uses bounded reconnect attempts; other recoverable API failures offer retry, new-chain, rollback, or clear actions.

## Development

The application entrypoint is [`agentx.mjs`](./agentx.mjs), setup entrypoint is [`agentx-setup.mjs`](./agentx-setup.mjs), npm launchers are `bin/agentx.mjs` and `bin/agentx-setup.mjs`, implementation modules are under `src/`, and behavioral specifications are indexed in [`specs/README.md`](./specs/README.md). Documentation: [docs](docs/README.md) · [specifications](specs/README.md) · [examples](examples/README.md).

This project follows Spec Driven Development: update the applicable specification before tests and implementation. Package metadata and the exact publication files allowlist are defined in `package.json`; versioned release notes are in [`RELEASE_NOTES.md`](./RELEASE_NOTES.md). The package is `@eliware/agentx-cli`, published versions are available from [npm](https://www.npmjs.com/package/@eliware/agentx-cli), and the repository version is the source for release tags.

## Testing

Run aggregate validation with `npm test` (`eliware-test`), or focused stages with `npm run lint`, `npm run audit`, and `npm run pack`. Formatting uses `npm run format` and `npm run format:check`. Application tests run through the shared harness and enforce 100% statements, branches, functions, and lines for in-scope production code.

## Troubleshooting

- If startup reports a missing API key, run `agentx-setup` or configure `agentx_api_key` / `AGENTX_API_KEY` in the environment.
- Run `agentx --check-mcp` to validate optional MCP configuration without making an API request.
- Use `agentx --help` for option details. See [Troubleshooting](./docs/troubleshooting.md) and [Quickstart](./docs/quickstart.md) for more.

## Security

Tool permission classifications are advisory, not a sandbox. Shell wrappers, scripts, aliases, substitutions, and encoded commands may bypass name-based classification. Use `--confirm` when human review is needed; do not treat AgentX as an isolation boundary for untrusted prompts or workspaces. Output redacts sensitive values where supported; avoid sharing logs containing private data. Never commit API keys, MCP credentials, tokens, user conversations, or runtime state. Keep user-local settings private.

## Configuration

Runtime settings are stored in user-local AgentX configuration and can be managed with `agentx-setup` or the interactive `/setup` command. The API key can also be supplied through `agentx_api_key` or `AGENTX_API_KEY`. `AGENTX_MODEL` selects the model (default `gpt-6-luna`) and `AGENTX_PERMISSION` selects the default tool permission (default `execute`). The [`.env.example`](./.env.example) lists environment names, including internal worker/test variables that normally should not be set manually. Optional MCP server definitions are loaded from `~/.agentx.mcp.json`; use [`.agentx.mcp.json.example`](./.agentx.mcp.json.example) as a shape reference. CLI arguments control an invocation and are not persistent runtime settings. `package.json` and `package.json.eliware.apply` are package/repository metadata, not runtime configuration.

## Operations

Startup: `agentx` validates configuration before contacting OpenAI and waits for the first user message. Shutdown: use `quit`, `exit`, `/quit`, or `/exit`; shutdown is graceful and repeatable. User-visible workflows include interactive and one-shot requests, local `cd` and `!` commands, MCP calls, and worker spawn/status/cancel operations. Session state is persisted in the current working directory; successful checkpoints support recovery and one-shot invocations use isolated pending state. Worker records and logs are kept in private per-user state, isolated by canonical working directory. Operational boundary: review paths before destructive local commands; advisory tool permissions are not a sandbox. See [session state](./docs/conversation-state.md), [commands](./docs/commands.md), and [configuration](./docs/configuration.md) for operational details.

## Commands

| Command or option                                                                                                                                           | Behavior                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `agentx`                                                                                                                                                    | Start an interactive session.                                                            |
| `agentx-setup`                                                                                                                                              | Configure user-local settings.                                                           |
| `agentx --help` (`-h`, `-?`)                                                                                                                                | Print help.                                                                              |
| `agentx --version` (`-v`)                                                                                                                                   | Print package version.                                                                   |
| `agentx --cwd PATH` (`-C PATH`)                                                                                                                             | Run from a selected working directory; relative paths resolve from launch directory.     |
| `agentx --confirm`                                                                                                                                          | Require confirmation for tool execution.                                                 |
| `agentx --check-mcp` (`-K`)                                                                                                                                 | Validate MCP settings without an API request.                                            |
| `agentx --debug`                                                                                                                                            | Enable diagnostic WebSocket logs; do not share output without reviewing it.              |
| `agentx --quiet` (`-q`)                                                                                                                                     | Suppress usage, timers, and tool/status output.                                          |
| `agentx --no-usage`, `--no-colors`, `--no-timers`, `--no-reasoning`, `--no-shell-calls`, `--no-tool-calls`, `--no-mcp-output`, `--no-websearch`, `--no-mcp` | Suppress selected output or disable MCP loading.                                         |
| `agentx "message"`                                                                                                                                          | Send one request, perform permitted tool calls, print the response and usage, then exit. |

Short output flags are stackable (`-u`, `-c`, `-t`, `-r`, `-s`, `-o`, `-M`, `-w`, `-q`); `-m` disables MCP loading (for example, `-qur`). Use paths and shell syntax appropriate for the current platform. Destructive local shell operations are user-issued commands; review their target and use confirmation before running them. Direct `!` commands have no automatic timeout; Ctrl-C terminates them. Ctrl-T interrupts model-requested shell tools.

## Exit codes

Exit code `0` indicates successful command completion. A nonzero exit code indicates invalid arguments, configuration or runtime failure, or an unsuccessful operation. Errors should be reported without exposing credentials. For command-specific details, use `agentx --help` and the relevant documentation.

## Support

For help, questions, or community chat, visit [eliware.org on Discord](https://discord.gg/M6aTR9eTwN).

## License

MIT © Eli Sterling, eliware.org. See [license](LICENSE).

## Links

- [Home page](https://eliware.org)
- [Eliware GitHub organization](https://github.com/eliware)
- [GitHub repository](https://github.com/eliware/agentx-cli)
- [npm package](https://www.npmjs.com/package/@eliware/agentx-cli)
- [Release notes](./RELEASE_NOTES.md)
- [Documentation](./docs/README.md)
- [Specifications](./specs/README.md)
- [Discord](https://discord.gg/M6aTR9eTwN)
