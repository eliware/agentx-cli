# Tools, workers, and goals

AgentX can call tools during a response. Tool use depends on the request and enabled settings.

## Shell tools

The model can use shell tools to run local commands. Tool permission levels classify commands as read, write, or execute.

These labels do not isolate commands. A script or shell wrapper can perform actions that the labels do not detect. Use `--confirm` to review high-risk commands.

Press Ctrl-T to interrupt a model-requested `shell_call`. AgentX returns an interruption result and tells the model to stop and report current status.

For direct shell commands, prefix the command with `!`. Press Ctrl-C to stop a running direct command.

## MCP tools

AgentX can load tools from configured MCP servers. MCP servers are optional. See the [configuration guide](configuration.md) for setup and validation.

Use `--no-mcp` to omit MCP tools from a request. Use `--no-mcp-output` to keep MCP tools enabled and hide their output.

## Worker tools

AgentX can start independent workers with `spawn_agent`. Give each worker one clear task. Choose `read`, `write`, or `execute` permission. The default is `execute`.

Use `agent_status` to read worker status and output. It accepts up to 10 worker IDs. Use `wait_ms` to wait for up to 180 seconds. Output defaults to 2,048 bytes and cannot exceed 8,192 bytes. Use `output_offset` to read older output or `search` to find matching lines.

Use `cancel_agent` to cancel one or more active workers. It accepts up to three worker IDs. AgentX stops active workers when the parent session exits.

Workers use the current successful checkpoint and the supplied task. A worker cannot start or manage other workers. Completed workers remain available for status checks.

## Inspect images

AgentX can inspect one to ten local images with `view_image`. Give each image a path and, optionally, a caption. Paths can be relative to the active working directory.

Set a prompt of up to 10,000 characters. The default detail is `low`; supported values are `low`, `auto`, and `high`.

Image inspection runs in a separate request. It does not add image data to the main conversation. The model can also use image generation when the selected model supports it.

## Autonomous goals

Run `/goal TEXT` to start a goal. AgentX can continue tool work until the model reports completion, a block, or more work.

The model can ask you a question when it needs your input. Answer the question to continue. Use `/goal status` to check progress, `/goal resume` to resume a paused goal, and `/goal cancel` or `/stop` to stop it.

AgentX discards goal state when it starts. A goal does not resume after a process restart.
