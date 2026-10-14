# Configuration

AgentX reads runtime settings from the process environment and the user file `~/.agentx`. Keep both private.

## API key

AgentX needs an OpenAI API key before it can send a request. Set `agentx_api_key` or `AGENTX_API_KEY`, or enter the key with `agentx-setup`.

The lowercase variable takes priority when both variables have values. The setup tool stores the key in `~/.agentx`.

## Runtime settings

Set these values in `~/.agentx`, through `agentx-setup`, or in the process environment.

| Name                          | Default      | Allowed values or effect                                 |
| ----------------------------- | ------------ | -------------------------------------------------------- |
| `AGENTX_MODEL`                | `gpt-6-luna` | Model ID from the OpenAI client catalog.                 |
| `AGENTX_REASONING_MODE`       | `standard`   | `standard` or `pro`.                                     |
| `AGENTX_REASONING_EFFORT`     | `low`        | `none`, `low`, `medium`, `high`, `xhigh`, or `max`.      |
| `AGENTX_REASONING_SUMMARY`    | `auto`       | `concise`, `detailed`, `auto`, or `null`.                |
| `AGENTX_OUTPUT_VERBOSITY`     | `low`        | `low`, `medium`, or `high`.                              |
| `AGENTX_COMPACTION_THRESHOLD` | `200000`     | Positive token count.                                    |
| `AGENTX_PERMISSION`           | `execute`    | Default shell permission: `read`, `write`, or `execute`. |

Use `agentx-setup` to view and change supported settings. Do not set a model ID that the OpenAI client does not support.

## MCP servers

Optional MCP server settings go in `~/.agentx.mcp.json`. Copy [the example](../.agentx.mcp.json.example), then set a server URL and any required authorization. Keep credentials out of shared files.

Set `"enabled": false` to keep a server entry but omit its tools. Use `agentx --check-mcp` to check the file without contacting a server. Use `--no-mcp` (`-m`) to disable all MCP tools for one run. Use `--no-mcp-output` (`-M`) to hide MCP output while keeping the tools available.

## Session files

AgentX stores the active session in `.agentx_responseid` and successful checkpoints in `.agentx_checkpoint` in the current directory. One-shot requests use temporary `.agentx_responseid.oneshot-*` files. These files can contain conversation data. Do not commit them.

See [session state](conversation-state.md) for resume and rollback details. Command options apply to one run. Package data does not set runtime options.
