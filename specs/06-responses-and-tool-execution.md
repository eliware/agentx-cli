


Worker processes must be terminated when the parent AgentX process exits. Shutdown sends SIGTERM first, waits a bounded grace period, then sends SIGKILL if the child is still alive. The same escalation applies to worker timeouts and cancellations. Completed workers remain queryable; active workers are terminated during shutdown. Preserve `timed_out` or `cancelled` as the terminal reason when already set.


Worker permission levels are enforced by the harness: `read` permits recognized read-only commands, `write` permits recognized read/write commands but not arbitrary execution, and `execute` permits normal shell execution. Unknown commands and shell redirection require `execute` or `write` as appropriate; permission checks happen before shell execution. Tool confirmation remains opt-in; execute mode is the default.

Ctrl-T interruption: When the user presses Ctrl-T during an active model-requested `shell_call`, terminate the running command/process group and return a completed tool result marked as incomplete/timeout. The result must include a clear user-directed interruption message instructing the agent not to retry or execute additional commands, and to stop tool execution and report the current status to the user.

## Debug event logging

When `--debug` is enabled, AgentX must print transport lifecycle events and raw Responses protocol events from `@eliware/openai`, and suppress live status rendering. Debug output is diagnostic only and must not change request or tool behavior. API keys and authorization headers must never be printed.

## Worker session context

A spawned worker inherits the shared successful checkpoint and receives its task as a new message using the checkpoint response ID. One-shot workers suppress human-oriented session recap output while retaining the inherited conversation context. Before the worker task, they receive a concise developer instruction identifying them as delegated workers: they must complete only the assigned task, must not orchestrate or spawn agents, and must report when done.

## Image inspection tool

The default tool set includes a `view_image` function available to normal AgentX sessions and delegated one-shot workers when image inspection is supported. Workers cannot use orchestration tools, but may inspect local images from their own active working directory. Its arguments are:

- `images`: required array of 1-10 objects, each containing `path` and optional `caption`. Paths are resolved relative to the active cwd when not absolute.
- `prompt`: required inspection instruction, maximum 10,000 characters.
- `detail`: optional `low`, `auto`, or `high`; default `low`.

AgentX must validate that every path is a readable regular file and reject more than 10 images. The tool may read images outside the cwd when the resolved path is explicitly supplied. Errors are returned as concise tool output for the model; they do not create a separate user prompt.

Image inspection runs in an isolated Responses API branch from the response immediately preceding the caller’s tool-call response. AgentX must use the caller response’s `previous_response_id` when available, falling back to the supplied response ID; for delegated workers this remains the worker chain, never the parent agent’s live response. The branch request contains the prompt and, sequentially, each image with its caption text immediately before that image; it has no custom functions, MCP tools, or other tools. AgentX should transcode supported and unsupported local image formats to a temporary JPEG before encoding, using a cross-platform image library, with bounded dimensions and output size. The configured AgentX model is used by default; a separate vision model is optional future configuration.

Only the branch's text response is returned as the `view_image` tool output. Temporary converted data and branch checkpoint state are discarded after completion. The main conversation continues from its original response ID, so image bytes are not included in the main conversation chain.

## Goal state tool

Goal mode exposes one `goal_update` function instead of separate lifecycle functions. Its required `method` is one of `complete`, `incomplete`, `blocked`, or `question`; optional fields carry summary/evidence or question/choices. Goal work requests require a tool call. After ordinary work-tool results, the next request restricts required tool selection to `goal_update`, preventing prose-only continuation loops. `complete` stops live status rendering, sends the completion acknowledgement, reports the final response usage and completion timing with tool selection disabled for the acknowledgement response, without streaming that response, and returns the final response to the interactive prompt, `blocked` ends it as blocked, `question` pauses for user input and resumes, and `incomplete` continues autonomous work.
