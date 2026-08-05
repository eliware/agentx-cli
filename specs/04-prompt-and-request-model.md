# Prompt and request model

`prompt.json` is JSON containing a Responses request template. Preserve arbitrary top-level fields. The normal template includes `model`, `input`, `text`, `reasoning`, `context_management`, `tools`, `store`, and `include`.

The developer prompt starts from the template developer input text and appends:
- fixed AgentX identity and creator guidance;
- first instruction to "Be extremely consice. Sacrifice grammar for concision."
- system administrator/DevOps/developer role guidance;
- parallel-tool preference;
- always-on instruction to run focused tests, never run the full test suite unless explicitly requested, and suggest that the requestor run it when full validation is needed;
- current working directory;
- concatenated AGENTS.md instructions, or a fallback saying none were found;
- terminal/plain-text guidance.
- final reminder to "Be extremely consice. Sacrifice grammar for concision."

On the first turn, clone the template deeply, replace the first input-text user placeholder (or the whole first user text) with the user request, and set `store: true`. Do not mutate the original template.

On later turns, send a new user input message `{ role: "user", content: [{ type: "input_text", text }] }`, set `previous_response_id`, and set `store: true`. Preserve the template's other top-level request settings.

Before sending a normal user request, prepend optional local context in this order:
1. `Local shell commands and output since the last assistant message:` plus the accumulated transcript.
2. A cwd-change note.
3. The actual user message.

MCP config is optional at `$HOME/.agentx.mcp.json`. Accept either a top-level array or `{ tools: [...] }`; merge entries after template tools. Missing file is allowed; invalid JSON is fatal and should be reported as a prompt-template load error.

The default template also defines asynchronous worker functions `spawn_agent`, `agent_status`, and `cancel_agent`. `spawn_agent` accepts 1-3 independent task strings plus optional `permissions` (`read`, `write`, or `execute`, default `execute`) and optional boolean `debug` (default `false`) and returns worker IDs without waiting. Worker processes cannot spawn nested workers and do not receive the `spawn_agent`, `agent_status`, or `cancel_agent` tools. Workers launch the AgentX entrypoint without a `--yolo` flag because default mode is already non-interactive; when `debug` is true, they receive `--debug`. Worker output is bounded and workers have a finite lifetime. `agent_status` accepts worker IDs and may use `wait` plus optional `timeout_ms`. Output is a bounded log view: by default it returns only the last 2048 bytes. Callers may set `output_bytes` (maximum 8192 bytes) and `output_offset` (number of bytes backward from the end) for pagination, or set `search` to a regular-expression string to return matching non-empty lines from the retained log. It returns status, elapsed time, line count, the selected output, usage, and errors. `cancel_agent` accepts one or more worker IDs and requests termination of active workers; completed, failed, timed-out, or unknown workers are left unchanged. Agents should cancel workers that are hung, stalled, or going off task instead of allowing them to consume resources.
