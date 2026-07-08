# AgentX WebSocket Task Breakdown

Status: draft

This is a concrete implementation checklist derived from `docs/websocket-mode-spec.md` and `docs/websocket-implementation-plan.md`.

## Phase 0: prep

- [ ] Read `docs/websocket-mode-spec.md`
- [ ] Read `docs/websocket-implementation-plan.md`
- [ ] Identify the current HTTP-only flow in `src/agent-session.mjs`
- [ ] Confirm which current tests cover the turn loop and session persistence

## Phase 1: transport seam

- [ ] Add a transport module under `src/` for OpenAI interaction
- [ ] Define a transport-neutral turn API
- [ ] Keep request construction in `src/agent-flow.mjs`
- [ ] Keep prompt rewriting in `src/prompt-builder.mjs`
- [ ] Make `src/agent.mjs` depend on the abstraction instead of raw SDK calls

### Files to touch

- `src/agent-session.mjs`
- `src/agent.mjs`
- new transport module under `src/`

## Phase 2: websocket connection and streaming

- [ ] Open a WebSocket connection to `/v1/responses`
- [ ] Send the initial turn request over the socket
- [ ] Handle incremental assistant text deltas
- [ ] Stop the thinking spinner when first output arrives
- [ ] Print concise live status lines for response start/end
- [ ] Keep buffering final assistant text for persistence
- [ ] Keep usage tracking intact

### Files to touch

- new websocket transport module
- `src/response.mjs`
- `src/response-parts.mjs`
- `src/agent-session.mjs`

## Phase 3: tool loop

- [ ] Detect `shell_call` events from the stream
- [ ] Print shell tool call summaries
- [ ] Run local shell calls in parallel when possible
- [ ] Convert local tool results back into `shell_call_output`
- [ ] Send tool outputs back to the same conversation
- [ ] Continue streaming until the model finishes

### Files to touch

- `src/tool-dispatch.mjs`
- `src/tool-shell.mjs`
- `src/agent-session.mjs`
- possibly the new transport module

## Phase 4: session state and recovery

- [ ] Preserve `.agentx_responseid` format
- [ ] Continue storing response id, usage, last user message, last assistant message, and pending transcript
- [ ] Save session state during and after a turn
- [ ] Reconnect if the socket closes mid-turn
- [ ] Resume with `previous_response_id` when valid
- [ ] Rebuild the request from saved local state when resume is not possible
- [ ] Surface clear messages for reconnect and transport errors

### Files to touch

- `src/session-state.mjs`
- `src/agent-flow.mjs`
- `src/agent-session.mjs`

## Phase 5: CLI behavior

- [ ] Keep `cd` internal
- [ ] Keep `>command` local
- [ ] Keep `/clear` resetting saved session state
- [ ] Keep `/usage` printing usage totals
- [ ] Keep `clear`, `quit`, and `exit` behavior unchanged
- [ ] Preserve prompt formatting and terminal wrapping

### Files to touch

- `src/agent.mjs`
- `src/shell.mjs`
- `src/text-wrap.mjs`

## Phase 6: debugging and logs

- [ ] Keep `--debug` output concise
- [ ] Log request metadata in debug mode
- [ ] Log streamed transport events only when helpful
- [ ] Avoid raw event dumps in normal mode

### Files to touch

- `src/agent-session.mjs`
- new transport module
- `src/cli.mjs` if help text changes

## Phase 7: tests

- [ ] Add a fresh-turn streaming test
- [ ] Add a tool-call streaming test
- [ ] Add a reconnect/recovery test
- [ ] Keep session persistence tests passing
- [ ] Keep `/clear`, `/usage`, `cd`, and `>command` tests passing
- [ ] Update response contract tests for any new streamed event shapes

### Files to touch

- `tests/agent.test.mjs`
- `tests/agent-session.test.mjs`
- `tests/responses-contract.test.mjs`
- `tests/agent-flow.test.mjs`
- `tests/agent-session.test.mjs`

## Suggested order of work

1. transport seam
2. websocket streaming
3. tool loop integration
4. persistence and recovery
5. CLI polish
6. test coverage
7. docs cleanup

## Done when

- [ ] AgentX runs end-to-end over WebSocket mode
- [ ] assistant text streams live in the terminal
- [ ] local tool execution still works
- [ ] `.agentx_responseid` still persists the session
- [ ] the test suite passes
- [ ] no normal-use HTTP fallback remains
