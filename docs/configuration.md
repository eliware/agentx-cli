# Configuration

AgentX reads runtime settings from the process environment and the user file `~/.agentx`. Keep both sources private.

## API key

AgentX needs an OpenAI API key before it can send a request. Set `agentx_api_key` or `AGENTX_API_KEY`, or enter the key with `agentx-setup`.

The lowercase name takes priority when both names have values. Setup saves the key in `~/.agentx`.

## Runtime settings

Set these values in `~/.agentx`, with `agentx-setup`, or in the process environment.

| Name                          | Default      | Allowed values or effect                            |
| ----------------------------- | ------------ | --------------------------------------------------- |
| `AGENTX_MODEL`                | `gpt-6-luna` | A model ID from the OpenAI client catalog.          |
| `AGENTX_REASONING_MODE`       | `standard`   | `standard` or `pro`.                                |
| `AGENTX_REASONING_EFFORT`     | `low`        | `none`, `low`, `medium`, `high`, `xhigh`, or `max`. |
| `AGENTX_REASONING_SUMMARY`    | `auto`       | `concise`, `detailed`, `auto`, or `null`.           |
| `AGENTX_OUTPUT_VERBOSITY`     | `low`        | `low`, `medium`, or `high`.                         |
| `AGENTX_COMPACTION_THRESHOLD` | `200000`     | A positive token count.                             |

Runtime settings use uppercase environment names. An invalid compaction threshold uses the default.

Use `agentx-setup` to view and change settings. Setup shows the active model and other saved values. Do not set a model ID that the OpenAI client does not support.

## MCP servers

MCP servers are optional. Save their settings in `~/.agentx.mcp.json`. Copy [the example](../.agentx.mcp.json.example), then set a valid HTTPS server URL and any required authorization.

The file has a `tools` array. Each entry uses `type`, `server_label`, `server_description`, and `server_url`. Add `headers` for required authorization and set `enabled` to `false` to disable an entry.

Use `agentx --check-mcp` to check file syntax, fields, HTTPS URLs, labels, and authorization presence. This option does not contact MCP servers. A missing file is valid.

Use `--no-mcp` (`-m`) to omit all MCP tools for one run. Use `--no-mcp-output` (`-M`) to hide MCP output while keeping the tools available.

Keep authorization values out of shared files and source control. The example uses a placeholder value.

## Permission levels

Worker shell permissions use `read`, `write`, or `execute`. `read` permits recognized read-only commands. `write` permits recognized read and write commands. `execute` permits normal shell execution.

These checks classify command names. Shell wrappers, scripts, aliases, substitutions, and encoded commands can bypass them. They do not create a security boundary.

Use `--confirm` to ask for approval before high-risk tool calls. This option does not create a sandbox.

## Session files

AgentX stores the active session in `.agentx_responseid` and successful checkpoints in `.agentx_checkpoint` in the current directory. These files can contain conversation data.

One-shot requests use a separate temporary file named `.agentx_responseid.oneshot-*`. Do not commit session files.

See the [session guide](conversation-state.md) for resume, rollback, and recovery behavior. See the [command guide](commands.md) for startup options.
