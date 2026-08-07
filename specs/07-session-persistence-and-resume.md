# Session persistence and resume

Persist JSON to `.agentx_responseid` in the launch directory after meaningful state changes. Write pretty-printed JSON plus a trailing newline. Required normalized fields:
- `response_id`: string
- `usage`: `{ inputTokens, cachedTokens, outputTokens, turns }`
- `last_user_message`: string
- `last_assistant_message`: string
- `pending_cli_transcript`: string
- `pending_tool_calls`: array of JSON-safe tool call objects
- `execution_journal`: array of tool execution records `{ identity, status, response_id, updated_at }`
- `history`: bounded array of successful response checkpoints
- `rollback_backup`: single bounded array containing checkpoints discarded by the latest rollback

Each `history` entry contains:
- `response_id`: completed Responses API response ID
- `timestamp`: ISO-8601 completion time
- `user_preview`: first 20 characters of the user message
- `assistant_preview`: first 20 characters of the assistant response
- `usage`: usage totals at that checkpoint

Only fully successful responses (`response.completed`, with no pending tool calls) may be added to history. Retain the most recent 20 entries.

Missing file returns null. Invalid JSON is treated as legacy state: its trimmed text becomes `response_id` and all other fields are defaults. Normalize malformed fields rather than crashing.

On each completed user turn update response ID, last user/assistant messages, usage, and clear consumed CLI transcript. While tool execution is in flight, save the response ID and pending calls before execution finishes. Record each tool identity as `pending`, `started`, or `completed` in `execution_journal`; preserve `started` records across crashes as possibly executed. Clear pending calls after successful completion.

If pending calls exist at startup, show a four-choice menu (default option 1):
1. Resume with interruption notice and let the agent decide whether to retry.
2. Resume with interruption notice and request further instructions; never retry.
3. Fully auto-resume pending execution.
4. Start a new session.

Options 1 and 2 must not re-run the interrupted call; instead return a synthetic output explaining the interruption. Option 3 executes normally. Option 4 deletes state and resets all local session data. If continuation reports `previous_response_not_found`, clear state and start a new chain.


## Rollback

The `/rollback` command opens an interactive checkpoint menu. Display each available checkpoint as a numbered row containing its number, local time, user preview, and assistant preview, plus a Cancel option. Support number keys, Up/Down arrows, Enter, and Ctrl-C using the same menu behavior as setup and session-resume menus.

Selecting a checkpoint restores its `response_id`, messages, usage, and session metadata; clears pending tool calls; and removes newer history entries. Preserve the discarded newer entries in a single rollback backup until the next successful turn or session clear. The selected response becomes the active session checkpoint. If no history exists, report that rollback is unavailable. Rollback restores conversation state only and does not undo previously executed shell commands or external side effects.


## Concurrent one-shot sessions

One-shot invocations use a unique state file and never read or write the interactive session's pending tool calls. They inherit only the latest successful checkpoint from `.agentx_checkpoint` (falling back to the interactive state's newest successful history entry). Successful interactive turns and rollbacks update that checkpoint. One-shot state is removed after a successful exit and remains isolated if interrupted.


Startup removes stale one-shot session-state files (`.agentx_responseid.oneshot-*`) older than one hour. Recent files are preserved to avoid disrupting active one-shot processes.


When a tool-output continuation fails, persist the exact continuation request as `pending_retry_request`. Retry must replay that request, including its `previous_response_id` and tool outputs, instead of resending the original user message. A pending retry request must never be silently substituted for a new user message. If recovery returns to the prompt without retrying or clearing it, preserve it only as explicitly pending state and require a deliberate retry/resume action before replaying it. Entering a new user message abandons the pending continuation rather than replaying it. Clear it after successful continuation, explicit session reset, or an explicit recovery choice to abandon the failed continuation.
