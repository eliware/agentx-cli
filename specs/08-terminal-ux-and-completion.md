# Terminal UX and completion

Use Node readline promises. Keep one active REPL interface for the session; its completer must read the current cwd at completion time so `cd` updates completion without creating a second input listener. Completion examines the final whitespace-delimited token, lists entries in the token's directory, sorts locale-wise, hides dotfiles unless the needle starts with `.`, appends the platform separator to directories, and quotes names containing spaces. Return `[matches, token]`. Support POSIX and Windows path semantics.

Text wrapping must use terminal width with an 80-column fallback and preserve ANSI escape sequences sufficiently for readable output. System, command, info, and MCP messages use ANSI styling; plain functionality must still work when output is redirected.

The live status controller tracks total elapsed time and reasoning/writing/executing phase durations. Render JSON-like fields such as `{"time":"1s","reasoning":"1s/1s",...}` with the active phase highlighted. Refresh roughly every 250ms, clear temporary lines before streamed output, pause during tool output, and never erase final response text.

Resume and setup menus use raw mode where available, hide/show cursor, redraw framed content, support 1-4 or arrows/Enter, and clean up listeners/raw mode on completion or Ctrl-C.

Usage reports show turns, input tokens, cached input tokens, output tokens, and calculated cost. Keep startup/status output concise; never dump complete tool results or encrypted reasoning.
