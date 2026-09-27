# AgentX CLI documentation

Return to the [repository README](../README.md).

Scope: this directory is the complete index of user-facing documentation for the AgentX terminal chat agent and setup helper.

## Purpose

These documents explain how to install, configure, use, validate, and troubleshoot AgentX CLI.

## Contents

- [Quickstart](quickstart.md)
- [Command reference](commands.md)
- [Session state](conversation-state.md)
- [Examples](examples.md)
- [Troubleshooting](troubleshooting.md)
- [Configuration](configuration.md)
- [MCP smoke tests](mcp-smoke-tests.md)
- [AGENTS.md behavior](agents.md)
- [Usage](usage.md)

Audience: CLI users. Prerequisites: a supported Node.js runtime and configured
project. Expected result: documented commands complete without undocumented
environment assumptions.

## Validation

Repository changes are validated with `eliware-test`, which runs applicable
formatting, lint, test/coverage, audit, and package checks. During development,
use `eliware-test --lint`, `eliware-test --format-check`, or pass a focused test
path such as `eliware-test tests/setup.test.mjs`. Release validation must also
pass `eliware-test --pack` before the authorized publication handoff.
