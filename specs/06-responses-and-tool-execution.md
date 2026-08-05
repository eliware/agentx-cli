# Responses API and tool execution

Use WebSocket URL `wss://api.openai.com/v1/responses` with `Authorization: Bearer <apiKey>`. Send `{ type: "response.create", ...request }` as JSON.

Parse text or Buffer frames as UTF-8 JSON; malformed frames are ignored by the event router. Route response events to optional callbacks: created, in-progress, output item/part added/done, text delta/done, response completed, and raw event.

A request resolves on `response.completed` with the response object. Server `error` events reject, except:
- `previous_response_not_found` propagates a typed error for session recovery;
- `websocket_connection_limit_reached` reconnects and resends the active request.

Unexpected socket errors and reconnectable closes (normal/going‑away or reasons containing close, limit, or disconnect) reconnect and resend the active request. Error and close events from the same socket must schedule at most one reconnect/resend; stale socket events must not affect the current connection or active request. Intentional `close()` now performs a graceful shutdown, waiting up to `socketCloseTimeoutMs` for the server to close before aborting; it still prevents reconnects.

The model may return shell calls, function calls, MCP calls, reasoning, and messages. Dispatch supported tool calls and return correctly shaped tool outputs with matching call IDs. Shell calls may contain command sequences, per-step cwd, timeout, and max output length. Execute all tool calls sequentially by default; parallel execution is not permitted unless explicitly enabled by a future specification. Capture stdout/stderr/outcome, and truncate output at 100,000 characters. During interactive shell execution, Ctrl-T immediately interrupts the active command regardless of its requested timeout; return a timeout outcome and tell the model the user interrupted execution. Non-interactive mode has no keyboard interrupt listener. Do not run unknown tool types silently as successful.

Each tool call must be dispatched at most once per assistant response turn. Use its call ID as the primary duplicate key. If no call ID exists, use a stable hash of the tool type, target, working directory, and normalized arguments. Duplicate calls must be suppressed and represented by one tool output; they must never execute twice merely because an event, batch, retry, reconnect, or resume path was observed more than once. Retries must preserve the original call identity and require an explicit policy decision when execution may already have started. Shell calls classified as state-changing or destructive require confirmation before execution. The prompt must pause/clear status timers and offer yes, no, session, and global choices. The model must not ask for a separate conversational confirmation; it must issue the tool call and let the runtime gate it. The `--yolo` runtime option bypasses confirmation for all tool calls. Session approvals last for the current process; global approvals persist in the user home configuration. Safe read-only commands, including `npm test` and `npm run lint`, do not prompt. Refusal returns an incomplete tool output and does not execute the command.

After tool outputs are collected, submit them using the response continuation mechanism until the model produces a final message. Persist a response snapshot immediately when a response ID or pending calls are known, so a crash can resume safely.

Display concise colored status for reasoning, executing, writing, shell calls, MCP calls, and streamed arguments. `--debug` prints raw WebSocket diagnostics, filters high-volume delta frames, and suppresses live status rendering.


## OpenAI error recovery

Recoverable OpenAI/API and WebSocket errors must not terminate the interactive REPL. Display a concise, human-readable error and preserve the current session state. Retry transient failures at most once automatically; never retry indefinitely.

If a request fails after a response ID or pending tool calls were persisted, do not repeatedly resume that failed continuation on restart. Mark it failed and present recovery choices: retry once, start a new response chain while preserving local context, rollback to a successful checkpoint, or clear the session. Starting a new chain or rolling back must clear pending tool calls.

A failed response must not be added to successful response history. Tool side effects are not automatically undone by retry, new-chain recovery, or rollback.

Failures shown by the recovery menu must include bounded diagnostics when available: error code/type, HTTP status, parameter, request ID, and a short cause. Do not print API keys, full request payloads, or unbounded raw events. Preserve the original error metadata for retry/new-chain decisions.
