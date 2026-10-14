# AGENTS.md

## Project

AgentX is a Node.js 26 native ESM terminal application. It uses the OpenAI Responses API.

## Scope and boundaries

Keep this repository focused on the AgentX CLI and npm package. Follow `specs/` for product behavior.

## Layout

- Put application code in `src/` and launchers in `bin/`.
- Put mirrored tests in `tests/` and shared test support in `test-fixtures/`.
- Keep user guides in `docs/` and behavior rules in `specs/`.

## Development

- Keep each module focused and use native ESM.
- Mirror each `src/*.mjs` module with one test under `tests/`.
- Keep source modules under 100 lines and test modules under 200 lines.
- Do not add coverage exclusions or internal export barrels.

## Validation

- Use `npm test`, `npm run lint`, `npm run audit`, `npm run format`, and `npm run format:check`.
- Require 100% statement, branch, function, and line coverage. Require zero lint warnings.
- Use Node.js 26 on Windows, Linux, and GitHub Actions.

## Security

- Keep keys, credentials, private data, and runtime state out of Git.
- Keep secrets in user settings or environment variables.
- Check every target path before a command changes or deletes files.

## Changes

- Do not publish or push without Eli's authorization and the Operations handoff.
- Do not change external systems without user authorization.
- Report validation results accurately.

## Application

- `src/agent-entrypoint.mjs` starts AgentX. `src/setup-entrypoint.mjs` starts setup.
- Validate settings before network access. Wait for the first user message before API access.
- Read runtime settings from user files and supported environment variables.
- Keep package metadata and command options separate from runtime settings.
- Use documented quit commands to close the session.

## CLI

- `bin/agentx.mjs` starts AgentX. `bin/agentx-setup.mjs` starts setup.
- Keep task text separate from flags. Support `--help` and `--version`.
- Validate option values. Return code 0 for success and nonzero for failure.
- Keep errors free of secrets. Support Windows and POSIX paths.
- Confirm the target before a destructive operation.

## npm publication

- Use `package.json.version` as the package version.
- Keep `package.json.files` limited to required package files.
- Set `publishConfig.provenance` to `true`.
- Run `eliware-test --pack` before an authorized release.
- Eli authorizes releases. DevOps publishes through the Operations handoff.
- Do not infer release approval from repository instructions.
