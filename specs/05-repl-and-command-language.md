# REPL and command language

The prompt identifies the user/host and normalized current directory and ends with a shell-like marker. The cwd shown in the prompt must update after `cd`.

Input is trimmed before processing, including internal command parsing. Blank lines do nothing. Dispatch precedence:
1. A leading `!` is a direct local shell command. Remove the marker and trim; empty commands do nothing. Execute it in the active cwd with no automatic timeout, stream both stdout and stderr to their console streams, capture both streams to pending CLI transcript, persist state, and do not contact OpenAI. While a direct shell command is running, Ctrl-C sends termination to that command/process group, waits for it to stop, returns to the AgentX prompt, and must not exit AgentX. This Ctrl-C behavior is separate from Ctrl-T, which remains reserved for timing out an active model-requested `shell_call`. Outside a running direct shell command, Ctrl-C retains its normal AgentX interruption/exit behavior.
2. Internal commands are parsed.
3. Everything else is a user message to OpenAI.

Commands:
- `cd`, `cd <path>`, `cd ~`, and `cd -`: resolve home, absolute, and relative paths; `cd -` returns to the previous working directory and reports an error if none is set; require a directory; update active cwd; add a note to the next request; no API request.
- `clear` and `/clear`: delete `.agentx_responseid`, reset response id, usage, messages, transcript, and pending calls; continue with a fresh session.
- `!clear`: execute the shell clear-screen command locally.
- `/usage`: print session token/cost totals.
- `/rollback`: open the successful-response checkpoint menu and restore a selected checkpoint.
- `/setup`: run setup and reload settings.
- `quit`, `exit`, `/quit`, `/exit`: leave after usage summary.

A direct shell transcript formats objects as stdout, then a blank line and `stderr:` when stderr exists; trim trailing whitespace. Multiple entries are separated by blank lines. This transcript is sent only with the next API user request, then cleared after successful submission.

Normal assistant responses are streamed/wrapped to terminal width. Tool status lines are temporary and must not overwrite final assistant output.

- `/goal <text>` starts autonomous goal mode; `/goal status` reports it; `/goal cancel` or `/stop` cancels it. Goal mode continues automatically until `goal_complete`, `goal_blocked`, cancellation, or the iteration limit. Goal-only tool definitions (`goal_complete`, `goal_blocked`) are sent only while goal mode is active. A saved active goal is cleared on startup. Ctrl-T cancels active goal mode.
