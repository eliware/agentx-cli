


Worker processes must be terminated when the parent AgentX process exits. Shutdown sends SIGTERM first, waits a bounded grace period, then sends SIGKILL if the child is still alive. The same escalation applies to worker timeouts and cancellations. Completed workers remain queryable; active workers are terminated during shutdown. Preserve `timed_out` or `cancelled` as the terminal reason when already set.


Worker permission levels are enforced by the harness: `read` permits recognized read-only commands, `write` permits recognized read/write commands but not arbitrary execution, and `execute` permits normal shell execution. Unknown commands and shell redirection require `execute` or `write` as appropriate; permission checks happen before shell execution. Tool confirmation remains opt-in; execute mode is the default.
