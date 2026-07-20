# Potential Bugs and Edge‑Case Notes

This document records observations made while inspecting the repository for runtime or logical issues that could surface in real usage. The codebase currently passes all tests, but a few edge cases may lead to crashes or unexpected behaviour.

## 1. Verbose transaction completion logs
*Location:* `src/agent-session.mjs`

`formatTransactionCompletionMessage` serialises all fields even when they are undefined, producing cluttered JSON with empty strings. While harmless, it may overwhelm logs.

**Recommendation:** Filter out undefined or empty values before stringifying.

## 2. Unhandled errors during `runSetup`
*Location:* `src/agent.mjs`

The REPL calls `await runSetup(...)`. If `runSetup` throws (e.g., due to invalid user input or file write failure), the entire agent process terminates without a friendly error message.

**Recommendation:** Wrap the call in try/catch and display an error before returning to the prompt.

## 3. Symlink loop in `readAgentsEntry`
*Location:* `src/shell-agents.mjs`

`readAgentsEntry` uses `fs.promises.realpath`. A symlink loop will cause `realpath` to throw an ENOENT‑style error that is not caught, propagating up and potentially crashing the REPL.

**Recommendation:** Catch errors from `realpath` and skip the entry gracefully, perhaps logging a warning.

## 4. WebSocket close handling timeout
*Location:* `src/runtime.mjs`

The socket‑close logic assumes the server will close within a configured timeout (`socketCloseTimeoutMs`). In network‑unstable environments this could lead to hangs or premature aborts.

**Recommendation:** Implement a fallback timeout and graceful shutdown if the server does not respond in time.

---

These items represent the most significant potential bugs identified during inspection. Addressing them will improve robustness and user experience without affecting current functionality.
