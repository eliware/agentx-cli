## 1. Symlink loop in `readAgentsEntry`
*Location:* `src/shell-agents.mjs`

`readAgentsEntry` uses `fs.promises.realpath`. A symlink loop will cause `realpath` to throw an ENOENT‑style error that is not caught, propagating up and potentially crashing the REPL.

**Recommendation:** Catch errors from `realpath` and skip the entry gracefully, perhaps logging a warning.

## 2. WebSocket close handling timeout
*Location:* `src/runtime.mjs`

The socket‑close logic assumes the server will close within a configured timeout (`socketCloseTimeoutMs`). In network‑unstable environments this could lead to hangs or premature aborts.

**Recommendation:** Implement a fallback timeout and graceful shutdown if the server does not respond in time.

