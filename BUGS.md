# Potential Bugs and Edge‑Case Notes

This document records observations made while inspecting the repository for runtime or logical issues that could surface in real usage. The codebase currently passes all tests, but a few edge cases may lead to crashes or unexpected behaviour.

## 1. `parseInternalCommand` whitespace handling
*Location:* `src/shell-commands.mjs`

The function does not trim the incoming message before matching command strings. The REPL already trims user input, so this is safe for now, but future changes that remove the trimming could cause commands with leading/trailing spaces to be ignored.

**Recommendation:** Add `message = message.trim()` at the start of `parseInternalCommand`.

## 2. Duplicate handling of the `clear` command
*Location:* `src/shell-commands.mjs` and `src/agent.mjs`

Both the REPL loop and `parseInternalCommand` handle a plain `clear` command: the loop calls `clearTerminal()` directly, while `parseInternalCommand` returns `{ type: 'session_clear' }`. This redundancy is harmless but confusing and could cause double‑clears if the order changes.

**Recommendation:** Keep only one source of truth – either handle it in the REPL or via the command parser. If both are needed, ensure they perform distinct actions.

## 3. Error message leaking absolute paths
*Location:* `src/shell-paths.mjs`

`resolveCdTarget` throws an error containing `${target || resolved}`. When `target` is falsy (e.g., user types just `cd`), the message exposes the full resolved path, which might leak sensitive directory information.

**Recommendation:** Mask or omit the absolute path in the error message, e.g., ``throw new Error(`cd: not a directory`)``.

## 4. Symlink loop in `readAgentsEntry`
*Location:* `src/shell-agents.mjs`

`readAgentsEntry` uses `fs.promises.realpath`. A symlink loop will cause `realpath` to throw an ENOENT‑style error that is not caught, propagating up and potentially crashing the REPL.

**Recommendation:** Catch errors from `realpath` and skip the entry gracefully, perhaps logging a warning.

## 5. Unhandled errors during `runSetup`
*Location:* `src/agent.mjs`

The REPL calls `await runSetup(...)`. If `runSetup` throws (e.g., due to invalid user input or file write failure), the entire agent process terminates without a friendly error message.

**Recommendation:** Wrap the call in try/catch and display an error before returning to the prompt.

## 6. WebSocket close handling timeout
*Location:* `src/runtime.mjs`

The socket‑close logic assumes the server will close within a configured timeout (`socketCloseTimeoutMs`). In network‑unstable environments this could lead to hangs or premature aborts.

**Recommendation:** Implement a fallback timeout and graceful shutdown if the server does not respond in time.

## 7. Verbose transaction completion logs
*Location:* `src/agent-session.mjs`

`formatTransactionCompletionMessage` serialises all fields even when they are undefined, producing cluttered JSON with empty strings. While harmless, it may overwhelm logs.

**Recommendation:** Filter out undefined or empty values before stringifying.

---

These items represent the most significant potential bugs identified during inspection. Addressing them will improve robustness and user experience without affecting current functionality.
