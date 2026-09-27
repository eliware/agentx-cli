# Specifications

Return to the [repository README](../README.md).

Repository authority: [authority.json](authority.json). Shared directive index: [directives.json](directives.json). Contract index: [contracts.json](contracts.json).

# AgentX Reconstruction Specifications

These documents are the normative behavioral specification for AgentX CLI.
They describe the intended product, runtime contracts, persistence formats,
terminal UX, and implementation boundaries. An agent recreating the project
must read all specification files before coding.

The numbered specifications remain the detailed source of truth:

- [01 — Product and architecture](01-product-and-architecture.md)
- [02 — Entrypoints and lifecycle](02-entrypoints-and-lifecycle.md)
- [03 — Configuration and setup](03-configuration-and-setup.md)
- [04 — Prompt and request model](04-prompt-and-request-model.md)
- [05 — REPL and command language](05-repl-and-command-language.md)
- [06 — Responses and tool execution](06-responses-and-tool-execution.md)
- [07 — Session persistence and resume](07-conversation-persistence-and-resume.md)
- [08 — Terminal UX and completion](08-terminal-ux-and-completion.md)
- [09 — Platform and filesystem](09-platform-and-filesystem.md)
- [10 — Usage, errors, and testing](10-usage-errors-and-testing.md)
- [Transaction completion logs](transaction-completion-logs.md)

Repository authority and structured contracts:

- [Authority register](authority.json)
- [Shared directives](directives.json)
- [Contracts](contracts.json)

- [Requirements](requirements.md)
- [Out of scope](out-of-scope.md)

## Reading order

Read the numbered specification documents in numeric order. The source code is
an implementation reference; these specifications are the source of truth for
a compatible rewrite.
