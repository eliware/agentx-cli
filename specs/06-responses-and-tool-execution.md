


Worker processes must be terminated when the parent AgentX process exits. Shutdown sends SIGTERM first, waits a bounded grace period, then sends SIGKILL if the child is still alive. The same escalation applies to worker timeouts and cancellations. Completed workers remain queryable; active workers are terminated during shutdown. Preserve `timed_out` or `cancelled` as the terminal reason when already set.


Worker permission levels are enforced by the harness: `read` permits recognized read-only commands, `write` permits recognized read/write commands but not arbitrary execution, and `execute` permits normal shell execution. Unknown commands and shell redirection require `execute` or `write` as appropriate; permission checks happen before shell execution. Tool confirmation remains opt-in; execute mode is the default.

Ctrl-T interruption: When the user presses Ctrl-T during an active model-requested `shell_call`, terminate the running command/process group and return a completed tool result marked as incomplete/timeout. The result must include a clear user-directed interruption message instructing the agent not to retry or execute additional commands, and to stop tool execution and report the current status to the user.

## Debug event logging

When `--debug` is enabled, AgentX must print transport lifecycle events and raw Responses protocol events from `@eliware/openai`, and suppress live status rendering. Debug output is diagnostic only and must not change request or tool behavior. API keys and authorization headers must never be printed.
