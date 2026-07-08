# AgentX WebSocket Implementation Plan

Status: draft

## Purpose

Map the proposed WebSocket transport to the current AgentX codebase and define the smallest practical set of changes needed to replace the HTTP Responses API path.

This plan assumes the CLI behavior stays the same from the user's perspective, with only live streamed assistant output and transport-level status updates added.

## Current codebase map

### Entry points

- `agentx.mjs` starts the CLI.
- `src/cli.mjs` handles `--help`, `--version`, and launch-time error reporting.
- `src/agent.mjs` runs the REPL and owns the turn loop.

### Request construction

- `src/agent-flow.mjs`
  - resolves the API key
  - loads `prompt.json`
  - builds the first-turn and resume request payloads
  - appends local shell transcript context

- `src/prompt-builder.mjs`
  - rewrites the first-turn developer/user prompt content
  - builds resume user messages

### Current transport path

- `src/agent-session.mjs`
  - starts/stops the thinking spinner
  - calls `openai.responses.create(...)`
  - handles tool-call continuations
  - extracts assistant text and usage

This is the main file that needs to be split so the CLI can talk to either HTTP or WebSocket through a small transport abstraction.

### Local tools and shell behavior

- `src/tool-dispatch.mjs`
  - converts `shell_call` items into local shell execution
  - converts local results back into `shell_call_output`

- `src/tool-shell.mjs`
  - executes shell commands locally
  - truncates long output

- `src/shell.mjs`
  - handles `cd`, `/clear`, `/usage`, `clear`, `quit`, and `exit`
  - formats terminal messages

### Session persistence

- `src/session-state.mjs`
  - reads and writes `.agentx_responseid`
  - stores response id, usage totals, last user message, last assistant message, and pending CLI transcript

### Output formatting

- `src/response.mjs` and `src/response-parts.mjs`
  - extract usage and text from Responses API payloads
  - format usage summaries

- `src/text-wrap.mjs`
  - wraps assistant output for terminal display

## Recommended implementation shape

### 1. Add a transport abstraction

Create a small module under `src/`, likely something like `src/openai-transport.mjs`, that exposes a transport-neutral interface such as:

- `startTurn(request, handlers)`
- `sendToolOutputs(responseId, outputs)`
- `close()`

The CLI should not know whether a turn came from HTTP or WebSocket.

### 2. Move turn orchestration out of `agent-session.mjs`

Refactor `src/agent-session.mjs` so it owns only the agent loop logic:

- start thinking indicator
- stream assistant text to the terminal
- collect tool calls
- run local tools
- persist final response state

Transport-specific socket handling should live elsewhere.

### 3. Keep local shell execution unchanged

Reuse the existing tool stack:

- `runToolCall()` in `src/tool-dispatch.mjs`
- `runShellCommands()` in `src/tool-shell.mjs`
- `toolOutputForCall()` for tool return payloads

That keeps command execution behavior stable while the transport changes.

### 4. Stream terminal output incrementally

Add live rendering hooks for:

- response start / end
- assistant text deltas
- reasoning summaries
- shell tool calls
- tool outputs
- reconnect notices and recoverable transport errors

Keep the output compact and avoid raw event dumps outside debug mode.

### 5. Preserve session state and resume behavior

Keep `.agentx_responseid` as the single session file.

The WebSocket path should still persist:

- latest response id
- usage totals
- last user message
- last assistant message
- pending CLI transcript

If a socket drops mid-turn, preserve the saved file and recover with `previous_response_id` when possible.

### 6. Add reconnect logic

Implement explicit recovery for:

- socket close
- connection limit reached
- transient transport failure
- missing/invalid previous response id

Preferred behavior:

1. reconnect
2. continue with `previous_response_id` when valid
3. otherwise rebuild the request from persisted local state and start a new chain

### 7. Keep prompt and command parsing stable

Do not change these unless the transport requires a small callback adjustment:

- `src/prompt-builder.mjs`
- `src/agent-flow.mjs`
- `src/shell.mjs`
- `src/session-state.mjs`

### 8. Update tests around behavior, not transport internals

Add coverage for:

- streamed assistant text during a fresh turn
- tool-call turn that streams, runs local shell tools, and resumes generation
- persistence of response id and transcript data
- `/clear`, `/usage`, `cd`, and `>command`
- reconnect/recovery behavior
- debug logging

## Suggested file-by-file change map

### Likely new files

- `src/openai-transport.mjs` or similar
- `src/websocket-stream.mjs` or similar helper for socket event parsing

### Likely changed files

- `src/agent.mjs`
- `src/agent-session.mjs`
- `src/response.mjs`
- `src/response-parts.mjs`
- `tests/agent-session.test.mjs`
- `tests/agent.test.mjs`
- `tests/responses-contract.test.mjs`

### Probably unchanged files

- `src/shell.mjs`
- `src/tool-shell.mjs`
- `src/tool-dispatch.mjs`
- `src/session-state.mjs`
- `src/prompt-builder.mjs`
- `src/cli.mjs`

## Phased execution plan

### Phase 1: transport seam

- introduce the abstraction
- keep HTTP behavior working behind the seam
- move request/response plumbing out of the CLI

### Phase 2: WebSocket request flow

- connect to `/v1/responses`
- send initial turn request
- handle streamed assistant events
- persist response ids and usage

### Phase 3: tool loop over WebSocket

- detect shell calls from streamed events
- run local tools in parallel
- send tool outputs back on the same conversation

### Phase 4: recovery and polish

- reconnect handling
- previous response fallback handling
- debug logging
- terminal output cleanup

### Phase 5: tests and docs

- update/extend the test suite
- document any new failure modes or debugging flags
- remove the old HTTP-only wording from docs once the WebSocket path is stable

## Acceptance target

The migration is complete when:

- AgentX runs end-to-end over WebSocket mode
- assistant text streams live in the terminal
- local shell tool calls still work
- `.agentx_responseid` remains the session source of truth
- the test suite passes
- no normal-use HTTP fallback remains
