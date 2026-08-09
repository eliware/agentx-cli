


Worker processes must be terminated when the parent AgentX process exits. Shutdown sends SIGTERM first, waits a bounded grace period, then sends SIGKILL if the child is still alive. The same escalation applies to worker timeouts and cancellations. Completed workers remain queryable; active workers are terminated during shutdown. Preserve `timed_out` or `cancelled` as the terminal reason when already set.


Worker permission levels are enforced by the harness: `read` permits recognized read-only commands, `write` permits recognized read/write commands but not arbitrary execution, and `execute` permits normal shell execution. Unknown commands and shell redirection require `execute` or `write` as appropriate; permission checks happen before shell execution. These classifications are advisory controls, not a security sandbox: shell wrappers, aliases, scripts, command substitutions, and encoded commands may bypass name-based classification. Use `--confirm` for human review and do not treat AgentX as a strong isolation boundary. Tool confirmation remains opt-in for ordinary state-changing commands; obviously destructive commands always require approval in interactive mode, even without `--confirm`. In one-shot or noninteractive mode, such commands are declined and returned to the model as incomplete tool output.

Shell command timeouts and Ctrl-T interruption must send SIGTERM first, wait a bounded grace period, then send SIGKILL to the process/process group when still alive. When the user presses Ctrl-T during an active model-requested `shell_call`, terminate the running command/process group and return a completed tool result marked as incomplete/timeout. The result must include a clear user-directed interruption message instructing the agent not to retry or execute additional commands, and to stop tool execution and report the current status to the user.

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

Image inspection runs in an isolated Responses API branch from the response immediately preceding the caller’s tool-call response. AgentX must track and pass the request’s actual `previous_response_id` for the caller response; it must never use the caller response ID itself as the branch parent when that response contains the `view_image` tool call. Fall back to the supplied response ID only when no predecessor is available; for delegated workers this remains the worker chain, never the parent agent’s live response. The branch request contains the prompt and, sequentially, each image with its caption text immediately before that image. The branch may use local `shell`/`shell_call` execution and the built-in `image_generation` tool, but must not receive custom functions, MCP tools, orchestration tools, or `view_image` itself. Shell calls use the delegated worker permission when present and execute in the active cwd; generated images are saved as temporary PNGs and their paths are returned to the branch as tool output context. AgentX should transcode supported and unsupported local image formats to a temporary JPEG before encoding, using a cross-platform image library, with bounded dimensions and output size. The configured AgentX model is used by default; a separate vision model is optional future configuration.

Each `view_image` call runs in a separate one-shot AgentX worker process with its own OpenAI client and WebSocket. Calls sharing the same branch parent are serialized in the caller so concurrent image inspections cannot race the same Responses conversation branch. The worker does not create a local checkpoint; it returns only inspection text, generated paths/errors, and usage. Usage is retained and added to the parent totals even when the worker returns an error or exits nonzero after making Responses requests. Usage from every response in the isolated image-inspection branch, including shell-continuation responses, is added to the parent session totals. Only the branch's text response is returned as the `view_image` tool output. Temporary converted data and branch checkpoint state are discarded after completion. The main conversation continues from its original response ID, so image bytes are not included in the main conversation chain.

## Image generation tool

The default tool set includes the Responses built-in `image_generation` tool. Supported host models may generate or edit images. When a completed `image_generation_call` contains a base64 `result`, AgentX writes it as a temporary PNG, prints the absolute path to the user, and appends that path to the pending CLI transcript so the next user request tells the agent where to find it. Generated files use the system temporary directory and are not automatically deleted during the session. Partial-image streaming events are not persisted as files. If saving fails or no result is present, AgentX reports a concise error and continues without crashing.

## Goal state tool

Goal mode exposes `goal_update` for autonomous lifecycle updates (`complete`, `incomplete`, or `blocked`) and a separate `goal_blocked` function for questions requiring user input. `goal_blocked` accepts a required question and optional choices, pauses the live status updater, displays the prompt, waits for the answer, and returns the answer as tool output. Unknown or malformed calls return validation output and do not advance the goal. Goal work requests require a tool call; after tool results, the next request still allows the full work-tool set and requires a tool call, explicitly tells the model not to repeat successful commands, and asks it to complete immediately when satisfied; only a response with no work tool calls prompts a final goal_update/goal_blocked decision. `complete` ends goal mode cleanly and streams the final goal response through the normal response stream exactly once; ordinary assistant responses use that same stream. `blocked` ends it as blocked; `incomplete` continues autonomous work.
