# AgentX Reconstruction Specifications

These documents are the normative behavioral specification for AgentX CLI. They describe the intended product, runtime contracts, persistence formats, terminal UX, and implementation boundaries. An agent recreating the project should read all files in this directory before coding.

## Reading order
1. `01-product-and-architecture.md`
2. `02-entrypoints-and-lifecycle.md`
3. `03-configuration-and-setup.md`
4. `04-prompt-and-request-model.md`
5. `05-repl-and-command-language.md`
6. `06-responses-and-tool-execution.md`
7. `07-session-persistence-and-resume.md`
8. `08-terminal-ux-and-completion.md`
9. `09-platform-and-filesystem.md`
10. `10-usage-errors-and-testing.md`

The source code remains an implementation reference; these specifications are the source of truth for a compatible rewrite.
