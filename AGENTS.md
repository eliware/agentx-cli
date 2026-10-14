# AGENTS.md

## Project

`@eliware/agentx-cli` is AgentX, a Node.js 26 native ESM terminal application. It sends requests through the OpenAI Responses API.

## Scope and boundaries

This repository owns the CLI and npm package. Shared policy belongs to Eliware. Follow the specifications in `specs/`.

## Layout

- `src/` contains application code. `bin/` contains CLI launchers.
- `tests/` mirrors `src/`. `test-fixtures/` contains test support.
- `specs/` defines behavior. `docs/` and `README.md` guide users.
- `package.json` defines package data, scripts, dependencies, and files.

## Development

- Read the README, specifications, and related docs before edits.
- Keep native ESM. Give each source and test module one purpose.
- Add each new purpose in a focused module with a mirrored test.
- Update specifications first. Then update tests and source code.
- Keep changes within this repository. Do not weaken shared rules.
- Keep modules under 100 lines. Keep tests under 200 lines.
- Do not add coverage-ignore rules or internal export barrels.

## Validation

- Run `npm test` for aggregate checks.
- Run `npm run lint` for lint checks.
- Run `npm run audit` for dependency checks.
- Run `npm run format` to format files.
- Run `npm run format:check` to check formatting.
- Run `eliware-test --pack` for package checks.
- Require 100% statements, branches, functions, and lines. Require zero lint warnings.
- Validate Node.js 26 on Windows, Linux, and GitHub Actions.

## Security

- Keep credentials, API keys, tokens, private data, and runtime state out of Git.
- Keep secrets in user settings or environment variables.
- Review paths before shell commands that can delete or change files.

## Changes

- Do not publish or push without Eli's authorization and the Operations handoff.
- Do not change external systems without user authorization.
- Report validation results accurately.

## Application

- `src/agent-entrypoint.mjs` starts AgentX. `src/setup-entrypoint.mjs` starts setup.
- Validate settings before network access. Wait for the first user message before API access.
- Read runtime settings from user files and supported environment variables.
- Keep package metadata and command options separate from runtime settings.
- Use documented quit commands for shutdown.

## CLI

- `bin/agentx.mjs` starts AgentX. `bin/agentx-setup.mjs` starts setup.
- Preserve documented commands and options. Validate option values.
- Keep task text separate from flags. Support `--help` and `--version`.
- Use the current directory and user settings as defaults.
- Return code 0 for success. Return a nonzero code for failure.
- Keep errors free of secrets. Support Windows and POSIX paths.
- Confirm the target before destructive operations.
- Run `npm test` and `eliware-test --pack`.

## npm publication

- Use `package.json.version` as the package version.
- Keep `package.json.files` limited to required package files.
- Run `eliware-test --pack` before an authorized release.
- Keep `publishConfig.provenance` set to `true`.
- Verify an approved release with `npm view @eliware/agentx-cli@<version> version`.
- Eli authorizes releases. DevOps publishes through the Operations handoff.
- Do not infer release approval from repository instructions.
