# Prompt and request model

`prompt.json` is JSON containing a Responses request template. Preserve arbitrary top-level fields. The normal template includes `model`, `input`, `text`, `reasoning`, `context_management`, `tools`, `store`, and `include`.

The developer prompt starts from the template developer input text and appends:
- fixed AgentX identity and creator guidance;
- system administrator/DevOps/developer role guidance;
- parallel-tool preference;
- current working directory;
- concatenated AGENTS.md instructions, or a fallback saying none were found;
- terminal/plain-text guidance.

On the first turn, clone the template deeply, replace the first input-text user placeholder (or the whole first user text) with the user request, and set `store: true`. Do not mutate the original template.

On later turns, send a new user input message `{ role: "user", content: [{ type: "input_text", text }] }`, set `previous_response_id`, and set `store: true`. Preserve the template's other top-level request settings.

Before sending a normal user request, prepend optional local context in this order:
1. `Local shell commands and output since the last assistant message:` plus the accumulated transcript.
2. A cwd-change note.
3. The actual user message.

MCP config is optional at `$HOME/.agentx.mcp.json`. Accept either a top-level array or `{ tools: [...] }`; merge entries after template tools. Missing file is allowed; invalid JSON is fatal and should be reported as a prompt-template load error.
