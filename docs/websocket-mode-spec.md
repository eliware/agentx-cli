# AgentX WebSocket Mode Spec

Status: proposed

## Summary

Replace the current OpenAI HTTP Responses API transport with OpenAI WebSocket mode, while keeping the CLI behavior the same from the user's point of view.

The visible change should be live assistant output while the model is generating. The rest of the AgentX interaction model should remain intact:

- prompt-driven REPL
- internal `cd`
- local `>command` execution
- `/clear`, `/usage`, `quit`, and `exit`
- persisted session state in `.agentx_responseid`
- local tool execution for shell calls

## Goals

- Reduce perceived latency for agentic coding workflows with many model/tool round trips.
- Stream assistant text into the terminal as it arrives.
- Keep the current local tool loop and session persistence behavior.
- Surface useful live events so the user can see what the agent is doing.
- Remove the HTTP transport path and make WebSocket mode the only OpenAI transport.

## Non-goals

- No fallback HTTP transport.
- No compatibility layer for older OpenAI transport behavior.
- No change to the REPL commands or shell semantics unless required by the WebSocket transport.
- No UI redesign.

## User Experience

The CLI should continue to feel like the current AgentX app, with these additions:

- assistant text appears incrementally instead of only after the full response ends
- the `Thinking...` indicator stops as soon as the first model output arrives
- streamed events print concise status lines in the terminal
- the final completed response still gets saved and printed in the normal place

Suggested event categories to print:

- response start / response end
- assistant text deltas
- reasoning summaries when available
- shell tool calls
- tool outputs
- recoverable transport errors and reconnect notices

The terminal output should stay concise. Avoid dumping raw transport JSON unless debug mode is enabled.

## Transport

Use OpenAI WebSocket mode against `/v1/responses` as the only request path.

Assume a direct WebSocket client in Node unless the OpenAI Node SDK exposes a first-class WebSocket helper in the current release. The implementation should not depend on the old HTTP `responses.create()` flow for normal operation.

## Session Model

Keep the current session persistence model:

- persist the latest response ID
- persist usage totals
- persist last user message and last assistant message
- persist any pending CLI transcript

Use `previous_response_id` to continue the conversation across turns.

Keep the session file format stable unless the WebSocket implementation forces a change.

## Streaming Behavior

When a response is in progress:

- start the thinking indicator
- stream assistant text as incremental output events arrive
- buffer the final assistant text for persistence and resume behavior
- keep printing compact live status events for reasoning and tool activity

When the response completes:

- stop the thinking indicator
- update the saved response ID
- append the completed assistant text to session state
- print the per-turn and cumulative usage summaries

## Tool Loop

Keep the current agent loop behavior:

- detect local shell tool calls from streamed response events
- run the shell calls locally
- send tool outputs back to the same WebSocket conversation using `response.create`
- continue until the model finishes without more tool calls

Parallel tool calls within a single model response should still run in parallel locally, as they do now.

## Reconnect / Recovery

Handle connection loss explicitly.

Expected behavior:

- reconnect when the socket closes or reaches the documented connection limit
- continue with `previous_response_id` when possible
- if the conversation cannot be resumed cleanly, start a new chain and rebuild the input from local persisted state
- preserve the saved session file even if the connection drops mid-turn

## Error Handling

Surface clear terminal messages for:

- connection failure
- reconnect attempt
- previous response not found
- transport-level errors
- websocket connection limit reached

The CLI should not crash on a transient connection failure if it can recover by reconnecting.

## Implementation Notes

- Add a small transport abstraction inside `src/` so the CLI logic does not know whether the model response came over HTTP or WebSocket.
- Keep tool execution code local to the existing shell/runtime modules.
- Keep the prompt builder, transcript persistence, and command parsing unchanged unless a streaming callback needs a small interface adjustment.
- Prefer small focused modules over a large monolithic socket handler.

## Testing

Required test coverage:

- initial turn streams text and completes successfully
- tool-call turn streams events, runs local tools, and resumes generation
- session persistence still writes response ID and transcript data
- `/clear`, `/usage`, `cd`, and `>command` behavior still works
- reconnect path preserves or restores conversation state
- debug mode still emits useful transport logs

## Acceptance Criteria

The feature is complete when:

- AgentX can run end-to-end over WebSocket mode
- assistant output streams live in the terminal
- tool-call workflows still work
- session state still persists to `.agentx_responseid`
- the test suite passes
- no HTTP fallback path is required for normal use

