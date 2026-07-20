# REPL and command language

The prompt identifies the user/host and normalized current directory and ends with a shell-like marker. The cwd shown in the prompt must update after `cd`.

Input is trimmed before processing, including internal command parsing. Blank lines do nothing. Dispatch precedence:
1. A leading `>` is a direct local shell command. Remove the marker and trim; empty commands do nothing. Execute it in the active cwd, append formatted output to pending CLI transcript, persist state, and do not contact OpenAI.
2. Internal commands are parsed.
3. Everything else is a user message to OpenAI.

Commands:
- `cd` or `cd <path>`: resolve `~`, absolute paths, and relative paths; require a directory; update active cwd; add a note to the next request; no API request.
- `clear` and `/clear`: delete `.agentx_responseid`, reset response id, usage, messages, transcript, and pending calls; continue with a fresh session.
- `>clear`: execute the shell clear-screen command locally.
- `/usage`: print session token/cost totals.
- `/setup`: run setup and reload settings.
- `quit`, `exit`, `/quit`, `/exit`: leave after usage summary.

A direct shell transcript formats objects as stdout, then a blank line and `stderr:` when stderr exists; trim trailing whitespace. Multiple entries are separated by blank lines. This transcript is sent only with the next API user request, then cleared after successful submission.

Normal assistant responses are streamed/wrapped to terminal width. Tool status lines are temporary and must not overwrite final assistant output.
