# AgentX CLI repository instructions

## Instruction scope

These repository-wide instructions apply to the entire repository. No subdirectory currently has a more specific `AGENTS.md`; deeper instructions must not weaken this file. Keep instructions actionable and concise.

## Read before changing

Read `README.md`, this file, and applicable files in `docs/` and `specs/` before changing implementation, tests, packaging, or workflows.

## Repository identity

Purpose: AgentX CLI is a cross-platform native-ESM Node.js terminal application and public npm package for interactive and one-shot OpenAI Responses API use.

## Scope and boundaries

This repository owns the CLI implementation, tests, user documentation, specifications, and npm publication metadata. `eliware/docs`, `eliware/conventions`, and `eliware/operations` remain authoritative for shared documentation, repository conventions, and cross-cutting operations. This repository does not own deployment, infrastructure, or external platform state.

## Authoritative sources

Use `eliware/docs`, `eliware/conventions`, and `eliware/operations` as authoritative shared sources. Applicable profiles in `package.json.eliware.apply` are general, application, CLI, and npm-published.

## Required structure

Keep implementation in `src/`, mirrored tests in `tests/`, user documentation in `docs/`, specifications in `specs/`, and thin executable entrypoints at the repository root and in `bin/`.

## Security and secrets

Never commit API keys, tokens, credentials, private conversations, runtime state, `.env` files, generated sessions, or machine-specific paths. Use the ignored local `.env`, user-owned AgentX configuration, or CI secret storage. Redact secrets from logs and fixtures.

## Validation

Use Node.js 26 with native ESM and `.mjs` modules. Run `npm ci`, `npm test`, `npm run lint`, `npm run audit`, `npm run format:check`, and `npm run pack` as applicable. Validate CLI `--help`, `--version`, exit codes, confirmation controls, redacted output, and environment configuration.

## Approved deviations

There are no approved convention deviations. Project-specific rules may add requirements but may not weaken shared conventions.

## Change control and authorization

Update the applicable specification before changing behavior, then update tests and implementation. Do not publish, change deployment, or alter external platform state without explicit authorization.

## Subdirectory instructions

No subdirectory-specific instructions exist at present. A deeper `AGENTS.md` must state its scope, structure, security rules, validation commands, and relationship to this file.
