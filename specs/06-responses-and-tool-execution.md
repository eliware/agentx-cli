# Responses API and tool execution

Use WebSocket URL `wss://api.openai.com/v1/responses` with `Authorization: Bearer <apiKey>`. Send `{ type: "response.create", ...request }` as JSON.

Parse text or Buffer frames as UTF-8 JSON; malformed frames are ignored by the event router. Route response events to optional callbacks: created, in-progress, output item/part added/done, text delta/done, response completed, and raw event.

A request resolves on `response.completed` with the response object. Server `error` events reject, except:
- `previous_response_not_found` propagates a typed error for session recovery;
- `websocket_connection_limit_reached` reconnects and resends the active request.

Unexpected socket errors and reconnectable closes (normal/going-away or reasons containing close, limit, or disconnect) reconnect and resend the active request. Intentional `close()` prevents reconnect. Reject if another request is already active.

The model may return shell calls, function calls, MCP calls, reasoning, and messages. Dispatch supported tool calls and return correctly shaped tool outputs with matching call IDs. Shell calls may contain command sequences, per-step cwd, timeout, and max output length. Execute steps sequentially when order matters, capture stdout/stderr/outcome, and truncate output at 100,000 characters. Do not run unknown tool types silently as successful.

After tool outputs are collected, submit them using the response continuation mechanism until the model produces a final message. Persist a response snapshot immediately when a response ID or pending calls are known, so a crash can resume safely.

Display concise colored status for reasoning, executing, writing, shell calls, MCP calls, and streamed arguments. `--debug` prints raw WebSocket diagnostics, filters high-volume delta frames, and suppresses live status rendering.
