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

Pure persisted-state shape normalization belongs to a dedicated normalization module with a mirrored test file. `conversation-state.mjs` owns atomic state-file I/O, legacy-text reads, and session deletion. `conversation-checkpoint.mjs` owns successful-checkpoint selection and persistence; `conversation-state-cleanup.mjs` owns stale one-shot file cleanup. Each boundary has a mirrored test file. Filesystem tests should exercise those boundaries without duplicating the normalizer's field-by-field cases.

The agent runtime coordinates session transitions; checkpoint selection/writes and stale one-shot cleanup are owned and tested by their focused modules. A focused pending-response adapter converts saved pending state to a Responses continuation and extracts tool-call IDs for recovery; it does not duplicate checkpoint I/O.

Response snapshot state transitions are owned by `agent/conversation-transitions.mjs`: it applies pending tool-call snapshots, records successful response history, and determines whether a shared checkpoint should be written. The `agent/conversation-persistence.mjs` coordinator owns serialization sequencing for runtime state, snapshot application plus state/checkpoint writes, and bounded execution-journal updates. Runtime supplies accessors for its session variables and remains responsible for the broader prompt/REPL lifecycle. Keep pure transition tests in `tests/agent/conversation-transitions.test.mjs` and persistence coordination tests in `tests/agent/conversation-persistence.test.mjs`; runtime tests cover only lifecycle wiring.

Restoring normalized saved session fields and selecting the response ID used to resume belongs to `agent/conversation-transitions.mjs`; the runtime owns startup messaging and recovery-menu interaction. Saved goal state is never restored across process restarts.

Cross-module Agent runtime lifecycle tests belong in `tests/agent/runtime.test.mjs`, mirroring `agent/runtime.mjs`. Keep those assertions to runtime wiring and lifecycle; test state normalization, persistence transitions, pending-response conversion, and recovery guidance at their respective focused module boundaries.

An explicit session clear resets every in-memory persisted field before deleting the state file: response and message IDs/text, usage, CLI transcript, pending tool calls and retry transaction, execution journal, history, rollback backup, failure state, and active goal. The same reset applies when startup recovery chooses a new session or a pending response is no longer available. The reset transition is pure and tested with session transitions; runtime tests verify that clearing cannot re-persist stale transaction/history data on the next save.

On each completed user turn update response ID, last user/assistant messages, usage, and clear consumed CLI transcript. While tool execution is in flight, save the response ID and pending calls before execution finishes. When a tool continuation completes successfully with no pending calls, immediately persist that response as the latest successful session/checkpoint entry before returning to the prompt, so a crash after the continuation cannot resume the failed branch. Record each tool identity as `pending`, `started`, or `completed` in `execution_journal`; preserve `started` records across crashes as possibly executed. Clear pending calls after successful completion.

If pending calls exist at startup, show a four-choice menu (default option 1):

1. Resume with interruption notice and let the agent decide whether to retry.
2. Resume with interruption notice and request further instructions; never retry.
3. Fully auto-resume pending execution.
4. Start a new session.

Options 1 and 2 must not re-run the interrupted call; instead return a synthetic output explaining the interruption. Option 3 executes normally. Option 4 deletes state and resets all local session data. If continuation reports `previous_response_not_found`, clear state and start a new chain.

Interruption guidance text and pending-call runner behavior are owned by `agent/recovery.mjs` and its focused tests. Runtime integration tests cover recovery-choice routing and verify interrupted calls are not re-executed; they should not duplicate the exact guidance text assertions.

## Rollback

The `/rollback` command opens an interactive checkpoint menu. Display each available checkpoint as a numbered row containing its number, local time, user preview, and assistant preview, plus a Cancel option. Support number keys, Up/Down arrows, Enter, and Ctrl-C using the same menu behavior as setup and session-resume menus.

Selecting a checkpoint restores its `response_id`, messages, usage, and session metadata; clears pending tool calls, execution journal, retry request/transaction, failure state, CLI transcript, and active goal; and removes newer history entries. Preserve the discarded newer entries in a single rollback backup until the next successful turn or session clear. The selected response becomes the active session checkpoint, and both ordinary and recovery-menu rollback persist that checkpoint. If no history exists, report that rollback is unavailable. Rollback restores conversation state only and does not undo previously executed shell commands or external side effects.

## Concurrent one-shot sessions

One-shot invocations use a unique state file and never read or write the interactive session's pending tool calls. They inherit only the latest successful checkpoint from `.agentx_checkpoint` (falling back to the interactive state's newest successful history entry). Successful interactive turns and rollbacks update that checkpoint. One-shot state is removed after a successful exit and remains isolated if interrupted.

Startup removes stale one-shot conversation-state files (`.agentx_responseid.oneshot-*`) older than one hour. Recent files are preserved to avoid disrupting active one-shot processes.

When a tool-output continuation fails, persist a durable `pending_transaction` containing the original tool-call response ID, calls, execution journal, exact continuation request, and its tool outputs; retain `pending_retry_request` as a compatibility alias. Retry must replay that request, including its `previous_response_id` and tool outputs, instead of resending the original user message. Startup recovery must use the recovery runner for pending calls, not the normal interactive executor. A pending retry request must never be silently substituted for a new user message. If recovery returns to the prompt without retrying or clearing it, preserve the transaction only as explicitly pending state and require a deliberate retry/resume action before replaying it. Entering a new user message abandons the pending continuation rather than replaying it. Clear it after successful continuation, explicit session reset, or an explicit recovery choice to abandon the failed continuation.

## Goals

Persist active goal metadata (`text`, `status`, `iterations`, timestamps, and result). Increment `iterations` only in the goal tool loop when a new autonomous continuation cycle is scheduled; persist that value immediately. Do not increment it again after the outer request returns or while asking a goal question. Ctrl-T cancellation must persist the cancelled status immediately. `/goal cancel`, session clear, rollback, and successful goal completion terminate active goal mode. On restart, all saved goal metadata is discarded; startup never resumes or contacts OpenAI for a prior goal. `/goal resume` applies only to a goal paused during the current session, while `/goal cancel` discards the current goal. Ctrl-C and `/stop` cancel active goal mode without exiting AgentX.
