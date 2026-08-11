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

MCP config is optional at `$HOME/.agentx.mcp.json`. Accept either a top-level array or `{ tools: [...] }`; merge enabled entries after template tools. An MCP entry with `enabled: false` is omitted from requests, allowing each server to be toggled without deleting credentials. The local `enabled` control field is stripped from enabled entries before sending the request because it is not part of the Responses API MCP schema. Missing file is allowed; invalid JSON is fatal and should be reported as a prompt-template load error.

The default template also defines asynchronous worker functions `spawn_agent`, `agent_status`, and `cancel_agent`. `spawn_agent` is for parallelizing genuinely independent work, not for delegating a small task the parent can complete directly. Agents should call it only when they intend to use the worker result, and should then explicitly wait for or poll the worker with `agent_status` before relying on it. Do not spawn a worker merely to appear busy, or continue with work that makes the worker unnecessary. `spawn_agent` accepts one task string plus optional `permissions` (`read`, `write`, or `execute`, default `execute`) and optional `wait_ms` (default `0`, clamped to 0-180,000ms). With positive `wait_ms`, it waits up to that duration and returns final/partial status; with zero it returns immediately. Workers inherit the parent debug setting, persist under `.agentx/workers`, and survive parent shutdown. Worker processes cannot spawn nested workers and do not receive the `spawn_agent`, `agent_status`, or `cancel_agent` tools. Workers launch the AgentX entrypoint without a `--yolo` flag because default mode is already non-interactive; when `debug` is true, they receive `--debug`. Worker output is bounded and workers have a finite lifetime. `agent_status` accepts worker IDs and may use `wait_ms`; waiting defaults to 0 and clamps to 0-180,000ms, and should be adjusted based on prior elapsed times and progress estimates. Output is a bounded log view: by default it returns only the last 2048 bytes. Callers may set `output_bytes` (maximum 8192 bytes) and `output_offset` (number of bytes backward from the end) for pagination, or set `search` to a regular-expression string to return matching non-empty lines from the retained log. It returns status, elapsed time, line count, the selected output, usage, and errors. Worker usage is parsed from every short per-turn usage line in the worker log, excluding cumulative session-total lines; token counts are comma-tolerant and aggregated. On worker completion, the parent prints the aggregate usage in blue without the worker ID as soon as no response deltas are streaming. When a worker exits, its aggregated usage and turn count are added once to the parent session totals, including failed, timed-out, or cancelled workers that emitted usage before termination, and parent cost fields are recalculated from the resulting token totals. `cancel_agent` accepts one or more worker IDs and requests termination of active workers; completed, failed, timed-out, or unknown workers are left unchanged. Agents should cancel workers that are hung, stalled, or going off task instead of allowing them to consume resources.

The prompt template may define the `view_image` function and the built-in `image_generation` tool. Built-in Responses API tool entries must use only fields supported by their tool type; `image_generation` must not include a custom `description` field. AgentX exposes/sends it to normal sessions and delegated one-shot workers when image inspection is enabled. Spawned workers still receive no orchestration tools (`spawn_agent`, `agent_status`, or `cancel_agent`). Image-inspection branch requests must override the template tool list with only the built-in local `shell` and `image_generation` tools and must not merge MCP tools or custom functions.
