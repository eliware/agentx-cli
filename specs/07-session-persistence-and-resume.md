# Session persistence and resume

Persist JSON to `.agentx_responseid` in the launch directory after meaningful state changes. Write pretty-printed JSON plus a trailing newline. Required normalized fields:
- `response_id`: string
- `usage`: `{ inputTokens, cachedTokens, outputTokens, turns }`
- `last_user_message`: string
- `last_assistant_message`: string
- `pending_cli_transcript`: string
- `pending_tool_calls`: array of JSON-safe tool call objects

Missing file returns null. Invalid JSON is treated as legacy state: its trimmed text becomes `response_id` and all other fields are defaults. Normalize malformed fields rather than crashing.

On each completed user turn update response ID, last user/assistant messages, usage, and clear consumed CLI transcript. While tool execution is in flight, save the response ID and pending calls before execution finishes. Clear pending calls after successful completion.

If pending calls exist at startup, show a four-choice menu (default option 1):
1. Resume with interruption notice and let the agent decide whether to retry.
2. Resume with interruption notice and request further instructions; never retry.
3. Fully auto-resume pending execution.
4. Start a new session.

Options 1 and 2 must not re-run the interrupted call; instead return a synthetic output explaining the interruption. Option 3 executes normally. Option 4 deletes state and resets all local session data. If continuation reports `previous_response_not_found`, clear state and start a new chain.
