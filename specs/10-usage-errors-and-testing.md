# Usage, errors, and verification

Use model pricing tables for the supported models and calculate costs in integer nano-dollars to avoid floating-point drift. Track input, cached input, output, and turns separately. A prompt above 270,000 input tokens is jumbo: apply 2x pricing to input, cached input, and output and show a warning.

Errors should be actionable and human-readable:
- missing API key: tell the user to set `agentx_api_key` or `AGENTX_API_KEY` or run setup;
- prompt/MCP read or parse error: include the prompt path and underlying message;
- unavailable prior response: clear session and explain it;
- noninteractive setup: say it requires an interactive terminal;
- shell failures: preserve stderr and exit information for the model.

Package behavior: ESM-only, Node executable scripts, MIT license, npm scripts `start`, `lint`, `test`, and `setup`. The test command runs Jest with coverage, VM modules, open-handle detection, silent output, and serial execution.

A compatible implementation should test pure helpers (settings, env serialization, path resolution/completion, prompt construction, response parsing, usage math, persistence), WebSocket event routing/reconnect, command dispatch, setup menu behavior, and REPL lifecycle. Also verify direct-vs-imported launcher behavior, Windows path branches, interrupted tool resume, malformed saved state, missing MCP config, and no API contact before the first normal message.
