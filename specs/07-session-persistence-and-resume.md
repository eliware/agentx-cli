# Session persistence and resume

Persist JSON to `.agentx_responseid` in the launch directory after meaningful state changes. Write pretty-printed JSON plus a trailing newline. Required normalized fields:
- `response_id`: string
- `usage`: `{ inputTokens, cachedTokens, outputTokens, turns }`
- `last_user_message`: string
- `last_assistant_message`: string
- `pending_cli_transcript`: string
- `pending_tool_calls`: array of JSON-safe tool call objects
- `history`: bounded array of successful response checkpoints

Each `history` entry contains:
- `response_id`: completed Responses API response ID
- `timestamp`: ISO-8601 completion time
- `user_preview`: first 20 characters of the user message
- `assistant_preview`: first 20 characters of the assistant response
- `usage`: usage totals at that checkpoint

Only fully successful responses (`response.completed`, with no pending tool calls) may be added to history. Retain the most recent 20 entries.

Missing file returns null. Invalid JSON is treated as legacy state: its trimmed text becomes `response_id` and all other fields are defaults. Normalize malformed fields rather than crashing.

On each completed user turn update response ID, last user/assistant messages, usage, and clear consumed CLI transcript. While tool execution is in flight, save the response ID and pending calls before execution finishes. Clear pending calls after successful completion.

If pending calls exist at startup, show a four-choice menu (default option 1):
1. Resume with interruption notice and let the agent decide whether to retry.
2. Resume with interruption notice and request further instructions; never retry.
3. Fully auto-resume pending execution.
4. Start a new session.

Options 1 and 2 must not re-run the interrupted call; instead return a synthetic output explaining the interruption. Option 3 executes normally. Option 4 deletes state and resets all local session data. If continuation reports `previous_response_not_found`, clear state and start a new chain.


## Rollback

The `/rollback` command opens an interactive checkpoint menu. Display each available checkpoint as a numbered row containing its number, local time, user preview, and assistant preview, plus a Cancel option. Support number keys, Up/Down arrows, Enter, and Ctrl-C using the same menu behavior as setup and session-resume menus.

Selecting a checkpoint restores its `response_id`, messages, usage, and session metadata; clears pending tool calls; and removes newer history entries. Preserve the discarded newer entries in a single rollback backup until the next successful turn or session clear. The selected response becomes the active session checkpoint. If no history exists, report that rollback is unavailable. Rollback restores conversation state only and does not undo previously executed shell commands or external side effects.
