# AGENTS.md

## Project

Repository identity and purpose: `@eliware/agentx-cli` is AgentX, a Node.js 26 native ESM terminal chat application using the OpenAI Responses API. Shared authority is in `eliware/docs`, `eliware/conventions`, `eliware/test`, and `eliware/operations`; local behavior and ownership are indexed by `specs/README.md`.

## Scope and boundaries

Repository scope and boundary: this root guidance applies repository-wide. A nearer, subdirectory-specific `AGENTS.md` applies only within that subdirectory and inherits these instructions; it may add project-specific requirements but must not weaken shared rules without authorization. This repository owns the CLI implementation and npm package metadata, not shared Eliware policy or external platform state.

## Layout

- `agentx.mjs` and `agentx-setup.mjs` are source entrypoints; `bin/` contains npm executables.
- `src/` contains implementation modules; `tests/` contains Jest tests.
- `specs/` is the behavioral authority; `docs/` and `README.md` contain user guidance.
- Required files and structure: `src/`, its mirrored `tests/` tree, `specs/`, `docs/`, and the documented package entrypoints. `package.json` defines package metadata, scripts, dependencies, and the publication allowlist.

## Development

Before changing files, read `README.md`, `AGENTS.md`, any applicable subdirectory `AGENTS.md`, and the applicable documentation and specifications. These instructions apply repository-wide; subdirectory-specific instructions apply only within their directory. Keep the project native ESM-only and make focused changes. Follow Spec Driven Development: update applicable specifications first, then tests, then implementation. Preserve interactive behavior and cross-platform support. Keep production modules focused and injectable; do not add coverage-ignore directives or pure internal export barrels. Project-specific requirements supplement shared conventions and must not weaken them without authorization. No intentional deviation from shared conventions is currently recorded. Required repository structure includes `src/`, a mirrored `tests/` tree, `specs/`, `docs/`, and documented package entrypoints.

## Validation

Use `eliware-test` for aggregate validation, `eliware-test --lint` for lint, and `eliware-test --pack` for package validation. Run focused tests during development; use the aggregate harness for requested/full verification. Maintain 100% statements, branches, functions, and lines for in-scope production code, with zero lint warnings. Validate Node.js 26 behavior and supported Windows, Linux, and GitHub Actions environments. Keep instructions actionable and concise; exclude credentials, secrets, and private machine-specific paths from tracked files.

## Security

Never commit credentials, API keys, tokens, `.env` files, private data, generated sessions, or runtime state. Keep secrets in user-local configuration or environment variables; redact sensitive output and do not copy secrets into logs, tests, docs, or package contents.

## Changes

Keep changes within this repository's authority. Do not publish, push, alter external state, or claim release verification without explicit user authorization and the applicable Operations release handoff. Do not create policy exceptions without the required Eli approval and record. Report validation accurately.

## Application

The runtime entrypoints are `agentx.mjs` (interactive application) and `agentx-setup.mjs` (interactive local setup); npm exposes them as `agentx` and `agentx-setup`. Lifecycle: validate configuration before connecting, wait for the user's first message before contacting OpenAI, and shut down through the documented quit commands. Runtime configuration comes from user-local AgentX settings and supported environment variables; package metadata and CLI options are not runtime settings. Keep runtime actions and filesystem changes within the user's requested boundary and scope.

## CLI

CLI entrypoints: `bin/agentx.mjs` launches `agentx.mjs`; `bin/agentx-setup.mjs` launches `agentx-setup.mjs`. Preserve documented commands and options, validate option values, and keep task text distinct from flags. Defaults come from the current working directory and user-local settings unless documented otherwise. `--help` and `--version` must remain supported. Exit code 0 indicates success; nonzero exit codes indicate command failure. Errors must not expose secrets. Support Windows and POSIX behavior without platform assumptions; destructive operations require explicit scope and confirmation or equivalent safeguards. Validate with `eliware-test` and `eliware-test --pack`.

## npm publication

Package identity is `@eliware/agentx-cli`; the `version` field in `package.json` is the authoritative version source. The exact `package.json.files` allowlist is `agentx.mjs`, `agentx-setup.mjs`, `bin/`, `prompt.json`, `src/`, `docs/`, `README.md`, `LICENSE`, `LICENSE.md`, `RELEASE_NOTES.md`, and `specs/`. Before a release, run `eliware-test --pack` and require its package validation and pack stages to pass. The publication workflow uses npm provenance as enabled by `publishConfig.provenance: true`. After an authorized release, perform exact-version registry verification with `npm view @eliware/agentx-cli@<version> version` and require the returned version to match the approved tag and `package.json`. Release authorization is provided by Eli; DevOps executes publication through the Operations release handoff. An agent must not publish or infer release authorization from these instructions.
