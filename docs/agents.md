# AGENTS.md behavior

AgentX looks for `AGENTS.md` in two places:

- `$HOME/AGENTS.md`, when it exists
- The current working directory and each of its filesystem parents

Files are loaded from least-specific to most-specific: the home file first, then the root and parent directories, ending with the current directory. A more-specific file can add to or clarify instructions from a broader file. Symlinked files that resolve to the same real path are loaded only once.

Loaded files are included in AgentX's system prompt on every request. Large `AGENTS.md` files therefore increase prompt size and request cost, especially when they are repeated across a session.

Keep each file focused and concise:

- Document stable project conventions, important commands, and safety constraints.
- Put general rules in a parent or home file and project-specific rules in the project file.
- Avoid copying README content, transient status, or instructions that do not affect agent behavior.
- Remove obsolete guidance regularly.

If no file is found, AgentX displays a reminder that you can ask it to generate one.
