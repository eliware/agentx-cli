# [![eliware.org](https://eliware.org/logos/brand.png)](https://discord.gg/M6aTR9eTwN)

## @eliware/agentx-cli [![npm](https://img.shields.io/npm/v/@eliware/agentx-cli)](https://www.npmjs.com/package/@eliware/agentx-cli) [![License](https://img.shields.io/github/license/eliware/agentx-cli)](https://github.com/eliware/agentx-cli/blob/main/LICENSE) [![CI](https://github.com/eliware/agentx-cli/actions/workflows/ci.yaml/badge.svg)](https://github.com/eliware/agentx-cli/actions/workflows/ci.yaml)

A lightweight terminal chat agent built on the OpenAI Responses API through the official @eliware/openai client.

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
- [Links](#links)
- [License](#license)

## Features

- Send messages to the OpenAI Responses API from a terminal.
- Use local shell commands with the `!` prefix.
- Use optional MCP tools and worker agents.
- Resume saved sessions and restore successful checkpoints.

## Requirements

- Node.js 26 or later.
- An OpenAI API key.
- Windows or Linux terminal.

## Setup

Install AgentX and run its setup command:

```sh
npm install --global @eliware/agentx-cli@latest
agentx-setup
```

Setup stores the API key and settings in user-local files. See [configuration](docs/configuration.md).

## Usage

Read the [release notes](RELEASE_NOTES.md) for version changes. Start an interactive session:

```sh
agentx
```

Send one request and exit:

```sh
agentx "summarize this project"
```

Type a message and press Enter. AgentX contacts OpenAI after your first message. See the [quickstart](docs/quickstart.md) and [command reference](docs/commands.md).

## Development

Read the [specification index](specs/README.md) before you change behavior. Read the [documentation index](docs/README.md) for user guides. Read [release notes](RELEASE_NOTES.md) for version changes.

## Testing

Run the shared validation command:

```sh
npm test
```

Run `npm run lint`, `npm run audit`, or `npm run pack` for one check.

## Troubleshooting

- Run `agentx-setup` if AgentX reports a missing API key.
- Run `agentx --help` to view command options.
- Read the [troubleshooting guide](docs/troubleshooting.md) for other issues.

## Security

Tool permission labels do not create a security boundary. Use `--confirm` when you need to review tool calls. Do not send untrusted work to AgentX as if it were isolated. Keep API keys and user data private.

## Configuration

AgentX reads settings from user-local files and supported environment variables. The `/setup` command edits runtime settings. See the [configuration guide](docs/configuration.md) for names, defaults, and file paths.

## Operations

AgentX checks settings before network access. It waits for your first message before it contacts OpenAI. Use `quit`, `exit`, `/quit`, or `/exit` to close the session. See the [session guide](docs/conversation-state.md) for saved data and recovery.

## Commands

Use `cd PATH` to change the working directory. Prefix a local shell command with `!`. Use `/usage`, `/rollback`, `/setup`, or `/clear` in a session. See the [command reference](docs/commands.md) for all commands and options.

## Exit codes

Code `0` means success. A nonzero code means command failure. Errors must not show credentials.

## Support

For help, questions, or to chat with the author and community, visit:

[![Discord](https://eliware.org/logos/discord_96.png)](https://discord.gg/M6aTR9eTwN)[![eliware.org](https://eliware.org/logos/eliware_96.png)](https://discord.gg/M6aTR9eTwN)

**[eliware.org on Discord](https://discord.gg/M6aTR9eTwN)**

## Links

- [Home Page](https://eliware.org)
- [GitHub Org](https://github.com/eliware)
- [GitHub Repo](https://github.com/eliware/agentx-cli)
- [Bug Reports](https://github.com/eliware/agentx-cli/issues)
- [npm](https://www.npmjs.com/package/@eliware/agentx-cli)
- [Discord](https://discord.gg/M6aTR9eTwN)

## License

[MIT © Eliware](LICENSE)
