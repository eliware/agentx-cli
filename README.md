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
- Run local shell commands with the `!` prefix.
- Use optional MCP tools and worker agents.
- Resume saved sessions and restore successful checkpoints.

## Requirements

- Node.js 26 or later.
- An OpenAI API key.
- Windows or Linux.

## Setup

Install AgentX and its setup command:

```sh
npm install --global @eliware/agentx-cli@latest
agentx-setup
```

## Usage

Start an interactive session:

```sh
agentx
```

Send one request and exit:

```sh
agentx "summarize this project"
```

Read the [release notes](RELEASE_NOTES.md) for version changes. Read the [user guides](docs/README.md) for supported workflows.

## Development

Read [specs/](specs/README.md) before you change product behavior. Use Node.js 26 and native ESM.

## Testing

Run all required checks with:

```sh
npm test
```

## Troubleshooting

Run `agentx-setup` if AgentX reports a missing API key. Run `agentx --help` to view options. Read the [troubleshooting guide](docs/troubleshooting.md) for other issues.

## Security

Permission labels do not create a security boundary. Use `--confirm` to review high-risk tool calls. Keep API keys and user data private.

## Configuration

AgentX reads runtime settings from user files and supported environment variables. Use `/setup` to edit runtime settings. Read the [configuration guide](docs/configuration.md) for details.

## Operations

AgentX checks settings before network access. It contacts OpenAI after your first message. Use `quit`, `exit`, `/quit`, or `/exit` to close a session.

## Commands

Use `cd PATH` to change the working directory. Prefix a local shell command with `!`. Use `/usage`, `/rollback`, `/setup`, or `/clear` in a session. Read the [command guide](docs/commands.md) for all commands and options.

## Exit codes

Code `0` means success. A nonzero code means failure. Errors do not show credentials.

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
